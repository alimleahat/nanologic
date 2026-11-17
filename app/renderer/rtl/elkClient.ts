// ELK runs in its own web worker so large gate-level views never freeze the UI.
import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import { layoutModule, type RtlLayout } from '@shared/rtl/layout';
import type { RtlModuleView } from '@shared/rtl/netlist';

let elk: InstanceType<typeof ELK> | undefined;
const cache = new WeakMap<RtlModuleView, Promise<RtlLayout>>();

/** Lay out a module view (cached per view object). */
export function layoutView(view: RtlModuleView): Promise<RtlLayout> {
  elk ??= new ELK({ workerFactory: () => new Worker(elkWorkerUrl) });
  let p = cache.get(view);
  if (!p) {
    p = layoutModule(elk, view);
    p.catch(() => cache.delete(view));
    cache.set(view, p);
  }
  return p;
}
