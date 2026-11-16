// Runs toolchain jobs in a worker thread (one at a time, in order).
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { ToolRequest, ToolResponse } from './workers/toolWorker';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class ToolClient {
  private worker?: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(private readonly workerPath: string) {}

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(this.workerPath);
    w.on('message', (m: ToolResponse) => {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.ok) p.resolve(m.result);
      else p.reject(new Error(m.error));
    });
    w.on('error', (e) => this.failAll(e));
    w.on('exit', (code) => {
      this.worker = undefined;
      if (code !== 0) this.failAll(new Error(`Toolchain worker stopped (code ${code})`));
    });
    this.worker = w;
    return w;
  }

  private failAll(e: Error) {
    for (const p of this.pending.values()) p.reject(e);
    this.pending.clear();
  }

  run<T>(kind: ToolRequest['kind'], args: unknown[]): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ensure().postMessage({ id, kind, args } as ToolRequest);
    });
  }

  dispose() {
    void this.worker?.terminate();
  }
}

export function workerPath(name: string): string {
  return path.join(__dirname, `${name}.cjs`);
}
