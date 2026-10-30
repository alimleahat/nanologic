import type { VcdData } from '@shared/vcd';

export function parseVcdInWorker(bytes: Uint8Array): Promise<VcdData> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./vcdWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ ok: boolean; data?: VcdData; error?: string }>) => {
      worker.terminate();
      if (e.data.ok && e.data.data) resolve(e.data.data);
      else reject(new Error(e.data.error ?? 'Could not read the waveform'));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage(bytes);
  });
}
