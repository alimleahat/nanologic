// Board definition types and helpers. The data itself lives in boards/*.json,
// which is transcribed from the board vendor's user manual (see spec section 8).
import de10LiteJson from '../../boards/de10-lite.json';

export type BoardSignalKind = 'clock' | 'button' | 'switch' | 'led' | 'sevenseg';

export interface BoardSignalGroup {
  /** Signal name as used in the vendor manual, e.g. "SW" or "MAX10_CLK1_50". */
  name: string;
  kind: BoardSignalKind;
  direction: 'input' | 'output';
  /** Exact Quartus I/O standard string. */
  ioStandard: string;
  /** True when the resource is active-low (lit or pressed when 0). */
  activeLow: boolean;
  /** True for single-bit signals without an index (e.g. clocks). */
  scalar: boolean;
  frequencyHz?: number;
  /** Pin per bit, index 0 = bit 0, written with the PIN_ prefix. */
  pins: string[];
  /** Whether the virtual board renders/drives this signal. */
  virtual: boolean;
  note?: string;
}

export interface BoardDefinition {
  id: string;
  name: string;
  family: string;
  device: string;
  source: string;
  sevenSegmentBits: string[];
  notes: string[];
  groups: BoardSignalGroup[];
}

/** One physical pin on the board: a whole scalar signal, or one bit of a bus. */
export interface BoardBit {
  /** Display/assignment name, e.g. "SW[3]" or "MAX10_CLK1_50". */
  id: string;
  group: BoardSignalGroup;
  /** Bit index within the group, 0 for scalars. */
  bit: number;
  pin: string;
}

export const DE10_LITE = de10LiteJson as BoardDefinition;

const boards: Record<string, BoardDefinition> = { [DE10_LITE.id]: DE10_LITE };

export function getBoard(id: string): BoardDefinition {
  const board = boards[id];
  if (!board) throw new Error(`Unknown board "${id}"`);
  return board;
}

export function boardBitId(group: BoardSignalGroup, bit: number): string {
  return group.scalar ? group.name : `${group.name}[${bit}]`;
}

export function listBoardBits(board: BoardDefinition): BoardBit[] {
  const bits: BoardBit[] = [];
  for (const group of board.groups) {
    group.pins.forEach((pin, bit) => bits.push({ id: boardBitId(group, bit), group, bit, pin }));
  }
  return bits;
}

export function findBoardBit(board: BoardDefinition, id: string): BoardBit | undefined {
  const m = /^([A-Za-z0-9_]+)(?:\[(\d+)\])?$/.exec(id.trim());
  if (!m) return undefined;
  const group = board.groups.find((g) => g.name === m[1]);
  if (!group) return undefined;
  if (group.scalar) return m[2] === undefined ? { id: group.name, group, bit: 0, pin: group.pins[0] } : undefined;
  if (m[2] === undefined) return undefined;
  const bit = Number(m[2]);
  if (bit >= group.pins.length) return undefined;
  return { id: boardBitId(group, bit), group, bit, pin: group.pins[bit] };
}
