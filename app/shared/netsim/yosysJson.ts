// Types for the subset of Yosys `write_json` output that NanoLogic uses.

/** A bit is a net number, or a constant "0", "1", "x" or "z". */
export type YosysBit = number | '0' | '1' | 'x' | 'z';

export interface YosysPort {
  direction: 'input' | 'output' | 'inout';
  bits: YosysBit[];
  offset?: number;
  upto?: number;
  signed?: number;
}

export interface YosysCell {
  hide_name: number;
  type: string;
  parameters: Record<string, string | number>;
  attributes: Record<string, string | number>;
  port_directions?: Record<string, 'input' | 'output' | 'inout'>;
  connections: Record<string, YosysBit[]>;
}

export interface YosysNetname {
  hide_name: number;
  bits: YosysBit[];
  attributes: Record<string, string | number>;
  offset?: number;
  upto?: number;
  signed?: number;
}

export interface YosysModule {
  attributes: Record<string, string | number>;
  parameter_default_values?: Record<string, string | number>;
  ports: Record<string, YosysPort>;
  cells: Record<string, YosysCell>;
  netnames: Record<string, YosysNetname>;
}

export interface YosysDesign {
  creator?: string;
  modules: Record<string, YosysModule>;
}

/** Parameters are written as binary strings ("0000...0101") or numbers. */
export function paramInt(value: string | number | undefined, fallback = 0): number {
  if (value === undefined) return fallback;
  if (typeof value === 'number') return value;
  if (/^[01xz]+$/.test(value)) {
    const clean = value.replace(/[xz]/g, '0');
    // Signed 32-bit parameters (e.g. negative offsets) are rare here; treat as unsigned.
    return clean.length > 52 ? Number(BigInt('0b' + clean)) : parseInt(clean, 2);
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Parse the "src" attribute ("file.v:12.3-14.8|other.v:3.1-3.5") into file and line. */
export function parseSrcAttribute(src: string | number | undefined): { file: string; line: number } | undefined {
  if (typeof src !== 'string') return undefined;
  const first = src.split('|')[0];
  const m = /^(.*):(\d+)(?:\.\d+)?(?:-\d+(?:\.\d+)?)?$/.exec(first);
  if (!m) return undefined;
  return { file: m[1], line: Number(m[2]) };
}
