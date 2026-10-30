// Connects a compiled design to the virtual board: drives top-level inputs from
// switches, keys and the clock through the project's pin assignments, and reads
// outputs back as board LED/segment levels.
import { findBoardBit, type BoardDefinition } from '../board';
import type { PinAssignment } from '../project';
import { portBitIndices, type TopPort } from '../toolTypes';
import type { CompiledSimulator } from './compile';

/** Logic level of every board output bit, or null when nothing drives it. */
export type BoardOutputLevels = Record<string, (0 | 1 | null)[]>;

export interface BoardInputs {
  /** Bit i = SW[i], 1 = up. */
  SW: number;
  /** Bit i = KEY[i] level, 1 = released (the keys are active-low). */
  KEY: number;
}

interface InputSlot {
  name: string;
  width: number;
  big: boolean;
  /** Bits from switches/keys: [port bit, group, group bit]. */
  fromBoard: [number, 'SW' | 'KEY', number][];
  clockMask: bigint;
  tieValue: bigint;
}

interface OutputTap {
  port: string;
  portBit: number;
  group: string;
  groupBit: number;
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

export class BoardEngine {
  private slots: InputSlot[] = [];
  private taps: OutputTap[] = [];
  private inputs: BoardInputs = { SW: 0, KEY: 0b11 };
  private hasOverrideClock: boolean;
  cycles = 0;
  readonly report: BoardWiringReport;

  constructor(
    readonly sim: CompiledSimulator,
    readonly board: BoardDefinition,
    ports: TopPort[],
    assignments: PinAssignment[],
    tieOffs: Record<string, number>,
  ) {
    this.hasOverrideClock = sim.overrides.some((o) => o.mode === 'clock');
    const report: BoardWiringReport = { clockPorts: [], unmappedInputs: [], unmappedOutputs: [] };
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
        else if (bb.group.name === 'SW' || bb.group.name === 'KEY') slot.fromBoard.push([k, bb.group.name, bb.bit]);
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
    this.applyInputs(0);
    this.sim.settle();
  }

  get hasClock(): boolean {
    return this.report.clockPorts.length > 0 || this.hasOverrideClock;
  }

  setInputs(inputs: Partial<BoardInputs>): void {
    this.inputs = { ...this.inputs, ...inputs };
    this.applyInputs(0);
    this.sim.settle();
  }

  getInputs(): BoardInputs {
    return { ...this.inputs };
  }

  private applyInputs(clk: 0 | 1): void {
    for (const s of this.slots) {
      let v = s.tieValue;
      for (const [k, group, gb] of s.fromBoard) if ((this.inputs[group] >> gb) & 1) v |= 1n << BigInt(k);
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
    const lo = clockSlots.map((s) => {
      let v = s.tieValue;
      for (const [k, group, gb] of s.fromBoard) if ((this.inputs[group] >> gb) & 1) v |= 1n << BigInt(k);
      return v;
    });
    const loV = clockSlots.map((s, i) => (s.big ? lo[i] : Number(lo[i])));
    const hiV = clockSlots.map((s, i) => (s.big ? lo[i] | s.clockMask : Number(lo[i] | s.clockMask)));
    const sim = this.sim;
    for (let c = 0; c < n; c++) {
      for (let i = 0; i < clockSlots.length; i++) sim.setInput(clockSlots[i].name, hiV[i]);
      if (override) sim.setOverrideClock(1);
      sim.settle();
      for (let i = 0; i < clockSlots.length; i++) sim.setInput(clockSlots[i].name, loV[i]);
      if (override) sim.setOverrideClock(0);
      sim.settle();
    }
    this.cycles += n;
  }

  reset(): void {
    this.sim.reset();
    this.cycles = 0;
    this.applyInputs(0);
    this.sim.settle();
  }

  outputs(): BoardOutputLevels {
    const out: BoardOutputLevels = {};
    for (const g of this.board.groups) if (g.direction === 'output') out[g.name] = g.pins.map(() => null);
    const values = this.sim.getOutputs();
    for (const t of this.taps) {
      const v = values[t.port];
      const bit = typeof v === 'bigint' ? Number((v >> BigInt(t.portBit)) & 1n) : (v >>> t.portBit) & 1;
      out[t.group][t.groupBit] = bit as 0 | 1;
    }
    return out;
  }
}
