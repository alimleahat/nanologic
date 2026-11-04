// Value Change Dump (VCD) parser. Designed for large files (tens of MB): it
// scans the text once without splitting it into lines, and stores each signal's
// changes in compact arrays.

export interface VcdScope {
  name: string;
  type: string;
  scopes: VcdScope[];
  /** Indices into VcdData.vars. */
  vars: number[];
}

export interface VcdVar {
  /** Full hierarchical name, e.g. "tb.dut.count". */
  path: string;
  name: string;
  /** Declared range suffix, e.g. "[3:0]", or "". */
  range: string;
  width: number;
  type: string;
  /** Index into VcdData.tracks (aliases share a track). */
  track: number;
}

export interface VcdTrack {
  width: number;
  /** Change times in timescale units, ascending. */
  times: Float64Array;
  /**
   * Values at each change. For 1-bit tracks: '0', '1', 'x', 'z'. For buses:
   * binary strings of exactly `width` characters (MSB first, may contain x/z).
   * For real variables: decimal strings.
   */
  values: string[];
}

export interface VcdData {
  /** Timescale, e.g. { magnitude: 1, unit: 'ps' }. */
  timescale: { magnitude: number; unit: string };
  /** Seconds per time unit. */
  secondsPerUnit: number;
  endTime: number;
  root: VcdScope;
  vars: VcdVar[];
  tracks: VcdTrack[];
}

const UNIT_SECONDS: Record<string, number> = { s: 1, ms: 1e-3, us: 1e-6, ns: 1e-9, ps: 1e-12, fs: 1e-15 };

class GrowableF64 {
  data = new Float64Array(16);
  length = 0;
  push(v: number) {
    if (this.length === this.data.length) {
      const n = new Float64Array(this.data.length * 2);
      n.set(this.data);
      this.data = n;
    }
    this.data[this.length++] = v;
  }
  finish(): Float64Array {
    return this.data.slice(0, this.length);
  }
}

export function parseVcd(input: string | Uint8Array): VcdData {
  const text = typeof input === 'string' ? input : new TextDecoder().decode(input);
  const n = text.length;
  let pos = 0;

  const isWs = (c: number) => c === 32 || c === 10 || c === 13 || c === 9;
  const next = (): string | null => {
    while (pos < n && isWs(text.charCodeAt(pos))) pos++;
    if (pos >= n) return null;
    const start = pos;
    while (pos < n && !isWs(text.charCodeAt(pos))) pos++;
    return text.slice(start, pos);
  };
  const untilEnd = (): string[] => {
    const parts: string[] = [];
    for (let t = next(); t !== null && t !== '$end'; t = next()) parts.push(t);
    return parts;
  };

  const root: VcdScope = { name: '', type: 'root', scopes: [], vars: [] };
  const stack: VcdScope[] = [root];
  const vars: VcdVar[] = [];
  const tracks: { width: number; times: GrowableF64; values: string[] }[] = [];
  const codeToTrack = new Map<string, number>();
  let timescale = { magnitude: 1, unit: 's' };

  // Header
  for (let tok = next(); tok !== null; tok = next()) {
    if (tok === '$enddefinitions') {
      untilEnd();
      break;
    }
    switch (tok) {
      case '$timescale': {
        const s = untilEnd().join('');
        const m = /^(\d+)\s*([munpf]?s)$/.exec(s);
        if (m) timescale = { magnitude: Number(m[1]), unit: m[2] };
        break;
      }
      case '$scope': {
        const [type, name] = untilEnd();
        const scope: VcdScope = { name: name ?? '', type: type ?? 'module', scopes: [], vars: [] };
        stack[stack.length - 1].scopes.push(scope);
        stack.push(scope);
        break;
      }
      case '$upscope':
        untilEnd();
        if (stack.length > 1) stack.pop();
        break;
      case '$var': {
        const parts = untilEnd();
        const [type, sizeStr, code, ...ref] = parts;
        const width = Number(sizeStr) || 1;
        let name = ref[0] ?? code;
        let range = ref.slice(1).join('');
        const inl = /^(.*?)(\[.*\])$/.exec(name);
        if (inl && !range) {
          name = inl[1];
          range = inl[2];
        }
        let track = codeToTrack.get(code);
        if (track === undefined) {
          track = tracks.length;
          tracks.push({ width: type === 'real' ? 0 : width, times: new GrowableF64(), values: [] });
          codeToTrack.set(code, track);
        }
        const scopePath = stack
          .slice(1)
          .map((s) => s.name)
          .join('.');
        vars.push({ path: scopePath ? `${scopePath}.${name}` : name, name, range, width, type, track });
        stack[stack.length - 1].vars.push(vars.length - 1);
        break;
      }
      default:
        if (tok.startsWith('$')) untilEnd();
    }
  }

  // Body
  let time = 0;
  let endTime = 0;
  const record = (code: string, value: string) => {
    const t = codeToTrack.get(code);
    if (t === undefined) return;
    const tr = tracks[t];
    const len = tr.values.length;
    if (tr.width > 1) {
      // Left-extend per VCD rules: 0/1 extend with 0, x with x, z with z.
      if (value.length < tr.width) {
        const pad = value[0] === 'x' || value[0] === 'z' ? value[0] : '0';
        value = pad.repeat(tr.width - value.length) + value;
      } else if (value.length > tr.width) value = value.slice(value.length - tr.width);
    }
    if (len > 0 && tr.times.data[tr.times.length - 1] === time) {
      tr.values[len - 1] = value; // later change at the same time wins
      return;
    }
    if (len > 0 && tr.values[len - 1] === value) return;
    tr.times.push(time);
    tr.values.push(value);
  };
  while (pos < n) {
    while (pos < n && isWs(text.charCodeAt(pos))) pos++;
    if (pos >= n) break;
    const c = text[pos];
    if (c === '#') {
      const tok = next()!;
      time = Number(tok.slice(1));
      if (time > endTime) endTime = time;
    } else if (c === '0' || c === '1' || c === 'x' || c === 'X' || c === 'z' || c === 'Z') {
      const tok = next()!;
      record(tok.slice(1), tok[0].toLowerCase());
    } else if (c === 'b' || c === 'B' || c === 'r' || c === 'R') {
      const v = next()!;
      const code = next();
      if (code === null) break;
      record(code, c === 'b' || c === 'B' ? v.slice(1).toLowerCase() : v.slice(1));
    } else if (c === '$') {
      const tok = next()!;
      // $dumpvars/$dumpall/$dumpon/$dumpoff wrap value changes; $comment is skipped.
      if (tok === '$comment') untilEnd();
    } else {
      next();
    }
  }

  return {
    timescale,
    secondsPerUnit: timescale.magnitude * (UNIT_SECONDS[timescale.unit] ?? 1),
    endTime,
    root,
    vars,
    tracks: tracks.map((t) => ({ width: t.width, times: t.times.finish(), values: t.values })),
  };
}

/** Index of the last change at or before `time` (-1 if none). */
export function valueIndexAt(track: VcdTrack, time: number): number {
  const times = track.times;
  let lo = 0;
  let hi = times.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= time) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export type Radix = 'bin' | 'hex' | 'unsigned' | 'signed';

/** Format a bus value (binary string, MSB first) in the given radix. */
export function formatValue(bits: string, radix: Radix): string {
  if (bits.length === 0) return '';
  if (/[xz]/.test(bits)) {
    if (radix === 'bin') return bits;
    if (/^x+$/.test(bits)) return 'x';
    if (/^z+$/.test(bits)) return 'z';
    if (radix === 'hex') {
      let out = '';
      const padded = bits.padStart(Math.ceil(bits.length / 4) * 4, '0');
      for (let i = 0; i < padded.length; i += 4) {
        const nib = padded.slice(i, i + 4);
        out += /x/.test(nib) ? 'x' : /z/.test(nib) ? 'z' : parseInt(nib, 2).toString(16);
      }
      return out;
    }
    return 'x';
  }
  if (radix === 'bin') return bits;
  const v = BigInt('0b' + bits);
  if (radix === 'hex') return v.toString(16).toUpperCase().padStart(Math.ceil(bits.length / 4), '0');
  if (radix === 'unsigned') return v.toString(10);
  const w = BigInt(bits.length);
  const signed = bits[0] === '1' ? v - (1n << w) : v;
  return signed.toString(10);
}
