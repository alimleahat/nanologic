// Pin assignment: automatic mapping by name, and validation.
import { boardBitId, findBoardBit, type BoardDefinition, type BoardSignalGroup } from './board';
import type { Message } from './messages';
import type { PinAssignment } from './project';
import { portBitIndices, type TopPort } from './toolTypes';

/** Name used for a port bit in Quartus assignments: "LEDR[3]" or "clk". */
export function portBitName(port: TopPort, bit: number | null): string {
  return port.scalar || bit === null ? port.name : `${port.name}[${bit}]`;
}

/** The board signal group a port maps to by name (case-insensitive), if any. */
export function standardGroupFor(port: TopPort, board: BoardDefinition): BoardSignalGroup | undefined {
  return board.groups.find((g) => g.name.toLowerCase() === port.name.toLowerCase());
}

/**
 * Map ports whose names match board signals (SW, KEY, LEDR, HEX0..HEX5,
 * MAX10_CLK1_50, ...) bit for bit. Existing assignments for other ports are kept.
 */
export function autoMap(ports: TopPort[], board: BoardDefinition, existing: PinAssignment[] = []): PinAssignment[] {
  const out = existing.filter((a) => !ports.some((p) => p.name === a.port && standardGroupFor(p, board)));
  for (const p of ports) {
    const g = standardGroupFor(p, board);
    if (!g) continue;
    if ((g.direction === 'input') !== (p.direction === 'input' || p.direction === 'inout')) continue;
    if (g.scalar) {
      if (p.width === 1) out.push({ port: p.name, bit: p.scalar ? null : p.lsb, board: g.name });
      continue;
    }
    const idx = portBitIndices(p);
    for (let k = 0; k < Math.min(idx.length, g.pins.length); k++) {
      out.push({ port: p.name, bit: p.scalar ? null : idx[k], board: boardBitId(g, k) });
    }
  }
  return sortAssignments(out, ports);
}

export function sortAssignments(list: PinAssignment[], ports: TopPort[]): PinAssignment[] {
  const order = new Map(ports.map((p, i) => [p.name, i]));
  return [...list].sort(
    (a, b) => (order.get(a.port) ?? 999) - (order.get(b.port) ?? 999) || (a.bit ?? 0) - (b.bit ?? 0),
  );
}

/** Replace the assignment of one port bit (board = '' removes it). */
export function setAssignment(list: PinAssignment[], port: string, bit: number | null, board: string): PinAssignment[] {
  const rest = list.filter((a) => !(a.port === port && a.bit === bit));
  return board ? [...rest, { port, bit, board }] : rest;
}

/** Map consecutive bits of a port onto consecutive bits of a board group, starting at `startBit`. */
export function mapPortToGroup(
  list: PinAssignment[],
  port: TopPort,
  group: BoardSignalGroup,
  startBit = 0,
): PinAssignment[] {
  const rest = list.filter((a) => a.port !== port.name);
  const idx = portBitIndices(port);
  const added: PinAssignment[] = [];
  for (let k = 0; k < idx.length && startBit + k < group.pins.length; k++) {
    added.push({ port: port.name, bit: port.scalar ? null : idx[k], board: boardBitId(group, startBit + k) });
  }
  return [...rest, ...added];
}

const ACTIVE_LOW_NAME = /(_n|_b|_l|_bar|_neg)$|^n_/i;

export function validatePins(ports: TopPort[], list: PinAssignment[], board: BoardDefinition): Message[] {
  const msgs: Message[] = [];
  const add = (severity: Message['severity'], text: string) => msgs.push({ severity, text, source: 'pins' });
  const byPin = new Map<string, string[]>();
  const portByName = new Map(ports.map((p) => [p.name, p]));

  for (const a of list) {
    const p = portByName.get(a.port);
    const label = p ? portBitName(p, a.bit) : a.bit === null ? a.port : `${a.port}[${a.bit}]`;
    if (!p) {
      add('warning', `Assignment for "${label}" refers to a port that is not in the top-level entity; it will be ignored.`);
      continue;
    }
    if (a.bit !== null && !portBitIndices(p).includes(a.bit)) {
      add('error', `"${label}" is outside the port's range [${p.msb}:${p.lsb}].`);
      continue;
    }
    if (a.bit === null && !p.scalar) {
      add('error', `"${p.name}" is a bus; assign each bit separately.`);
      continue;
    }
    const bb = findBoardBit(board, a.board);
    if (!bb) {
      add('error', `"${label}" is mapped to "${a.board}", which is not a ${board.name} signal.`);
      continue;
    }
    const portIsInput = p.direction === 'input';
    if (portIsInput && bb.group.direction === 'output') {
      add('error', `Input "${label}" is mapped to ${bb.id}, which is an output on the board (${bb.group.kind}).`);
    } else if (!portIsInput && bb.group.direction === 'input') {
      add('error', `Output "${label}" is mapped to ${bb.id}, which is an input on the board (${bb.group.kind}).`);
    }
    const users = byPin.get(bb.pin) ?? [];
    users.push(label);
    byPin.set(bb.pin, users);
  }
  for (const [pin, users] of byPin) {
    if (users.length > 1) add('error', `${users.join(' and ')} are all mapped to ${pin}. Each pin can only be used once.`);
  }

  for (const p of ports) {
    const indices = portBitIndices(p);
    const mine = list.filter(
      (a) => a.port === p.name && findBoardBit(board, a.board) && (a.bit === null ? p.scalar : indices.includes(a.bit)),
    );
    if (mine.length === 0) {
      add('warning', `Port "${p.name}" (${p.direction}${p.width > 1 ? `, ${p.width} bits` : ''}) is not mapped to a pin.`);
      continue;
    }
    if (mine.length < p.width) {
      add('warning', `Only ${mine.length} of the ${p.width} bits of "${p.name}" are mapped to pins.`);
    }
    const groups = new Set(mine.map((a) => findBoardBit(board, a.board)!.group));
    const g = groups.size === 1 ? [...groups][0] : undefined;
    const std = standardGroupFor(p, board);
    if (std && g === std && p.width !== std.pins.length && !std.scalar) {
      add('info', `"${p.name}" is ${p.width} bits wide; the board's ${std.name} has ${std.pins.length}.`);
    }
    const lowName = ACTIVE_LOW_NAME.test(p.name);
    for (const grp of groups) {
      if (grp.kind === 'clock') continue;
      if (lowName && !grp.activeLow) {
        add('warning', `"${p.name}" looks active-low (name ends in _n), but ${grp.name} is active-high: ${describeLevel(grp)}.`);
      } else if (!lowName && grp.activeLow && grp.kind === 'button' && !std) {
        add('info', `${grp.name} buttons read 0 while pressed. Check that "${p.name}" expects 0 = pressed.`);
      } else if (!lowName && grp.activeLow && grp.kind === 'sevenseg' && !std) {
        add('info', `${grp.name} segments light when the bit is 0. Check that "${p.name}" drives 0 for a lit segment.`);
      }
    }
  }
  return msgs;
}

function describeLevel(g: BoardSignalGroup): string {
  switch (g.kind) {
    case 'switch':
      return 'a switch reads 1 when up';
    case 'led':
      return 'an LED lights when its bit is 1';
    case 'button':
      return 'a button reads 0 while pressed';
    case 'sevenseg':
      return 'a segment lights when its bit is 0';
    default:
      return 'it is not inverted';
  }
}
