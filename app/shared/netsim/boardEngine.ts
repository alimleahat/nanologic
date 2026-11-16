// Connects a compiled design to the virtual board: drives top-level inputs from
// switches, buttons and the clock through the project's pin assignments, and
// reads outputs back as board LED/segment levels. For boards with a multiplexed
// seven-segment display (Basys 3) it also models persistence of vision.
import { findBoardBit, mainClock, type BoardDefinition } from '../board';
import type { PinAssignment } from '../project';
import { portBitIndices, type TopPort } from '../toolTypes';
import type { CompiledSimulator, SimValue } from './compile';

/** Logic level of every board output bit, or null when nothing drives it. */
export type BoardOutputLevels = Record<string, (0 | 1 | null)[]>;

/**
 * Input levels per board input group (switches and buttons), bit i = level of
 * bit i of that group. E.g. { SW: 0b101, KEY: 0b11 } or { sw: 1, btnC: 0 }.
 */
export type BoardInputs = Record<string, number>;

/** What a multiplexed display looks like to the eye. */
export interface DisplayFrame {
  /** Brightness 0..1 per digit (index 0 = an[0], the rightmost) and segment (0-6, 7 = dp). */
  digits: number[][];
  /**
   * "persistence": averaged over the last few milliseconds of board time, as an
   * eye sees a scanned display. "instant": what is enabled at this moment (used
   * at slow clock speeds, where there is no persistence of vision).
   */
  mode: 'persistence' | 'instant';
}

/** Board time over which the display is averaged (the eye's persistence). */
export const PERSISTENCE_SECONDS = 0.01;
/** The window is split into this many time buckets (plus one being filled). */
const BUCKETS = 16;
const RING = BUCKETS + 1;

interface InputSlot {
  name: string;
  width: number;
  big: boolean;
  /** Bits from switches/buttons: [port bit, group name, group bit]. */
  fromBoard: [number, string, number][];
  clockMask: bigint;
  tieValue: bigint;
}

interface OutputTap {
  port: string;
  portBit: number;
  group: string;
  groupBit: number;
}

interface DisplayTap {
  /** Index into the simulator's outputs array. */
  out: number;
  portBit: number;
  /** Bit in the segment mask (0-7) or digit index for anodes. */
  bit: number;
  anode: boolean;
}

export interface BoardWiringReport {
  clockPorts: string[];
  unmappedInputs: { port: string; width: number; tie: number }[];
  unmappedOutputs: string[];
}

/** Default constant for an unmapped input: 1 for names that look active-low. */
export function defaultTieOff(port: string): number {
  return /(_n|_b|_l|_bar)$/i.test(port) || /^n_/i.test(port) ? 1 : 0;
}

/** Input levels with nothing pressed and every switch down. */
export function defaultBoardInputs(board: BoardDefinition): BoardInputs {
  const out: BoardInputs = {};
  for (const g of board.groups) {
    if (g.direction !== 'input' || g.kind === 'clock') continue;
    out[g.name] = g.kind === 'button' && g.activeLow ? 2 ** g.pins.length - 1 : 0;
  }
  return out;
}

function bitOfValue(v: SimValue, bit: number): number {
  return typeof v === 'bigint' ? Number((v >> BigInt(bit)) & 1n) : (v >>> bit) & 1;
}

export class BoardEngine {
  private slots: InputSlot[] = [];
  private taps: OutputTap[] = [];
  private inputs: BoardInputs;
  private hasOverrideClock: boolean;
  cycles = 0;
  readonly report: BoardWiringReport;

  // Multiplexed display model.
  private displayTaps: DisplayTap[] = [];
  private outBuf: SimValue[] = [];
  private digits = 0;
  private bucketCycles = 1;
  private lastKey = 0;
  private lastChange = 0;
  /** On-time per (bucket, digit, segment): a box average over the last BUCKETS buckets. */
  private buckets: Float64Array = new Float64Array(0);
  private topBucket = 0;

  constructor(
    readonly sim: CompiledSimulator,
    readonly board: BoardDefinition,
    ports: TopPort[],
    assignments: PinAssignment[],
    tieOffs: Record<string, number>,
  ) {
    this.inputs = defaultBoardInputs(board);
    this.hasOverrideClock = sim.overrides.some((o) => o.mode === 'clock');
    const report: BoardWiringReport = { clockPorts: [], unmappedInputs: [], unmappedOutputs: [] };
    const outIndex = new Map(sim.outputs.map((o, i) => [o.name, i]));
    const disp = board.display;
    for (const p of ports) {
      const indices = portBitIndices(p);
      const bitOf = (a: PinAssignment) => (a.bit === null ? 0 : indices.indexOf(a.bit));
      const mine = assignments.filter((a) => a.port === p.name);
      if (p.direction === 'output') {
        for (const a of mine) {
          const bb = findBoardBit(board, a.board);
          const k = bitOf(a);
          if (!bb || k < 0 || bb.group.direction !== 'output') continue;
          this.taps.push({ port: p.name, portBit: k, group: bb.group.name, groupBit: bb.bit });
          const oi = outIndex.get(p.name);
          if (disp && oi !== undefined) {
            if (bb.group.name === disp.segments) this.displayTaps.push({ out: oi, portBit: k, bit: bb.bit, anode: false });
            else if (bb.group.name === disp.decimalPoint) this.displayTaps.push({ out: oi, portBit: k, bit: 7, anode: false });
            else if (bb.group.name === disp.anodes) this.displayTaps.push({ out: oi, portBit: k, bit: bb.bit, anode: true });
          }
        }
        if (mine.length === 0) report.unmappedOutputs.push(p.name);
        continue;
      }
      const slot: InputSlot = {
        name: p.name,
        width: p.width,
        big: p.width > 32,
        fromBoard: [],
        clockMask: 0n,
        tieValue: 0n,
      };
      const mapped = new Set<number>();
      for (const a of mine) {
        const bb = findBoardBit(board, a.board);
        const k = bitOf(a);
        if (!bb || k < 0 || bb.group.direction !== 'input') continue;
        mapped.add(k);
        if (bb.group.kind === 'clock') slot.clockMask |= 1n << BigInt(k);
        else slot.fromBoard.push([k, bb.group.name, bb.bit]);
      }
      if (slot.clockMask) report.clockPorts.push(p.name);
      if (mapped.size < p.width) {
        const tie = tieOffs[p.name] ?? defaultTieOff(p.name);
        // Unmapped bits take the tie value's bits.
        for (let k = 0; k < p.width; k++) {
          if (!mapped.has(k) && (BigInt(tie) >> BigInt(k)) & 1n) slot.tieValue |= 1n << BigInt(k);
        }
        if (mapped.size === 0) report.unmappedInputs.push({ port: p.name, width: p.width, tie });
      }
      this.slots.push(slot);
    }
    this.report = report;
    if (disp && this.displayTaps.length) {
      this.digits = disp.digits;
      this.buckets = new Float64Array(RING * disp.digits * 8);
      this.outBuf = new Array(sim.outputs.length).fill(0);
      const windowCycles = (mainClock(board)?.frequencyHz ?? 1e8) * PERSISTENCE_SECONDS;
      this.bucketCycles = Math.max(1, Math.round(windowCycles / BUCKETS));
    }
    this.applyInputs(0);
    this.sim.settle();
    this.lastKey = this.displayKey();
  }

  get hasClock(): boolean {
    return this.report.clockPorts.length > 0 || this.hasOverrideClock;
  }

  get hasMultiplexedDisplay(): boolean {
    return this.digits > 0;
  }

  setInputs(inputs: Partial<BoardInputs>): void {
    for (const [k, v] of Object.entries(inputs)) if (v !== undefined) this.inputs[k] = v;
    this.applyInputs(0);
    this.sim.settle();
    this.sampleDisplay();
  }

  getInputs(): BoardInputs {
    return { ...this.inputs };
  }

  private baseValue(s: InputSlot): bigint {
    let v = s.tieValue;
    for (const [k, group, gb] of s.fromBoard) if (((this.inputs[group] ?? 0) >> gb) & 1) v |= 1n << BigInt(k);
    return v;
  }

  private applyInputs(clk: 0 | 1): void {
    for (const s of this.slots) {
      let v = this.baseValue(s);
      if (clk) v |= s.clockMask;
      this.sim.setInput(s.name, s.big ? v : Number(v));
    }
  }

  /** Run `n` full clock cycles (rising then falling edge). */
  run(n: number): void {
    const clockSlots = this.slots.filter((s) => s.clockMask !== 0n);
    const override = this.hasOverrideClock;
    if (clockSlots.length === 0 && !override) return;
    // Precompute the two input values for each clock port.
    const lo = clockSlots.map((s) => this.baseValue(s));
    const loV = clockSlots.map((s, i) => (s.big ? lo[i] : Number(lo[i])));
    const hiV = clockSlots.map((s, i) => (s.big ? lo[i] | s.clockMask : Number(lo[i] | s.clockMask)));
    const sim = this.sim;
    // Sampling the display every cycle is exact; long runs sample every 4th cycle,
    // which is far finer than any real scan rate.
    const stride = this.digits ? (n > 1000 ? 4 : 1) : 0;
    for (let c = 0; c < n; c++) {
      for (let i = 0; i < clockSlots.length; i++) sim.setInput(clockSlots[i].name, hiV[i]);
      if (override) sim.setOverrideClock(1);
      sim.settle();
      for (let i = 0; i < clockSlots.length; i++) sim.setInput(clockSlots[i].name, loV[i]);
      if (override) sim.setOverrideClock(0);
      sim.settle();
      this.cycles++;
      if (stride && (c % stride === 0 || c === n - 1)) this.sampleDisplay();
    }
  }

  reset(): void {
    this.sim.reset();
    this.cycles = 0;
    this.applyInputs(0);
    this.sim.settle();
    this.buckets.fill(0);
    this.topBucket = 0;
    this.lastChange = 0;
    this.lastKey = this.displayKey();
  }

  outputs(): BoardOutputLevels {
    const out: BoardOutputLevels = {};
    for (const g of this.board.groups) if (g.direction === 'output') out[g.name] = g.pins.map(() => null);
    const values = this.sim.getOutputs();
    for (const t of this.taps) out[t.group][t.groupBit] = bitOfValue(values[t.port], t.portBit) as 0 | 1;
    return out;
  }

  // ---- multiplexed display ----

  /** Bits 0-7: segment lit (line low); bits 8+: digit enabled (anode low). */
  private displayKey(): number {
    if (!this.digits) return 0;
    this.sim.readOutputs(this.outBuf);
    let seg = 0;
    let an = 0;
    for (const t of this.displayTaps) {
      const low = bitOfValue(this.outBuf[t.out], t.portBit) === 0;
      if (!low) continue;
      if (t.anode) an |= 1 << t.bit;
      else seg |= 1 << t.bit;
    }
    return seg | (an << 8);
  }

  private sampleDisplay(): void {
    if (!this.digits) return;
    const key = this.displayKey();
    if (key === this.lastKey) return;
    this.integrate();
    this.lastKey = key;
  }

  /** Add the time spent in the current state (since the last change) to the time buckets. */
  private integrate(): void {
    const from = this.lastChange;
    const to = this.cycles;
    this.lastChange = to;
    if (to <= from) return;
    const cells = this.digits * 8;
    const bs = this.bucketCycles;
    const seg = this.lastKey & 0xff;
    const an = this.lastKey >> 8;
    const lastB = Math.floor((to - 1) / bs);
    // Clear ring slots for buckets we are moving into.
    for (let b = Math.max(this.topBucket + 1, lastB - RING + 1); b <= lastB; b++) this.buckets.fill(0, (b % RING) * cells, (b % RING + 1) * cells);
    if (lastB > this.topBucket) this.topBucket = lastB;
    // Only the most recent RING buckets matter.
    for (let b = Math.max(Math.floor(from / bs), lastB - RING + 1); b <= lastB; b++) {
      const n = Math.min(to, (b + 1) * bs) - Math.max(from, b * bs);
      if (n <= 0) continue;
      const base = (b % RING) * cells;
      for (let d = 0; d < this.digits; d++) {
        if (!((an >> d) & 1)) continue;
        for (let sg = 0; sg < 8; sg++) if ((seg >> sg) & 1) this.buckets[base + d * 8 + sg] += n;
      }
    }
  }

  /**
   * The display as the eye would see it. A segment that is on for 1/digits of
   * the time (a correctly scanned display) shows at full brightness; shorter
   * on-times (ghosting) show faintly, and a scan slower than the persistence
   * window makes digits flicker.
   */
  display(mode: DisplayFrame['mode']): DisplayFrame | undefined {
    if (!this.digits) return undefined;
    const digits: number[][] = [];
    if (mode === 'instant') {
      const seg = this.lastKey & 0xff;
      const an = this.lastKey >> 8;
      for (let d = 0; d < this.digits; d++) {
        digits.push(Array.from({ length: 8 }, (_, s) => (((an >> d) & 1) & ((seg >> s) & 1) ? 1 : 0)));
      }
      return { digits, mode };
    }
    this.integrate();
    const full = 1 / this.digits;
    const cells = this.digits * 8;
    const top = this.topBucket;
    const first = Math.max(0, top - BUCKETS + 1);
    const covered = this.cycles - first * this.bucketCycles;
    for (let d = 0; d < this.digits; d++) {
      const row: number[] = [];
      for (let s = 0; s < 8; s++) {
        let on = 0;
        for (let b = first; b <= top; b++) on += this.buckets[(b % RING) * cells + d * 8 + s];
        const duty = covered > 0 ? on / covered : 0;
        // Perceived brightness rises steeply at low duty, as LEDs do to the eye.
        const p = Math.min(1, Math.sqrt(duty / full));
        row.push(p < 0.03 ? 0 : Number(p.toFixed(3)));
      }
      digits.push(row);
    }
    return { digits, mode };
  }
}
