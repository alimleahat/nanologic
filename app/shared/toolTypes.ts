import type { Message } from './messages';
import type { HierarchyNode } from './verilogScan';

export interface TopPort {
  name: string;
  direction: 'input' | 'output' | 'inout';
  width: number;
  /** Declared MSB and LSB indices (equal for scalars). */
  msb: number;
  lsb: number;
  /** True for single-bit ports declared without a range. */
  scalar: boolean;
}

export interface AnalysisResult {
  ok: boolean;
  messages: Message[];
  ports: TopPort[];
  hierarchy?: HierarchyNode;
  durationMs: number;
}

export interface SimulationRequest {
  testbench: string; // project-relative path
  maxTimeNs: number;
}

export interface SimulationResult {
  ok: boolean;
  messages: Message[];
  testbenchModule?: string;
  /** Raw VCD bytes, if the run produced a waveform. */
  vcd?: Uint8Array;
  endReason: 'finished' | 'max-time' | 'timeout' | 'compile-error' | 'error';
  durationMs: number;
}

/** Declared bit indices of a port, LSB first. */
export function portBitIndices(p: TopPort): number[] {
  const out: number[] = [];
  const step = p.msb >= p.lsb ? 1 : -1;
  for (let i = 0; i < p.width; i++) out.push(p.lsb + i * step);
  return out;
}
