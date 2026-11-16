// Parses VCD files off the UI thread.
import { parseVcd } from '@shared/vcd';

self.onmessage = (e: MessageEvent<Uint8Array>) => {
  try {
    const data = parseVcd(e.data);
    (self as unknown as Worker).postMessage({ ok: true, data });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: (err as Error).message });
  }
};
