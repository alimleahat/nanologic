// The RTL Viewer's netlist: one drawable view per module, built from Yosys's
// JSON netlist (hierarchy kept). Each view lists symbols with their pins at
// fixed positions and the wires (buses) between them, with signal names and
// source lines. Layout (positions) is done separately (see layout.ts).
import type { Message } from '../messages';
import { paramInt, parseSrcAttribute, type YosysBit, type YosysCell, type YosysDesign, type YosysModule, type YosysNetname } from '../netsim/yosysJson';

export type RtlMode = 'rtl' | 'gates';

/** A net number, or a constant "0", "1", "x" or "z". */
export type RtlBit = YosysBit;

export type RtlShape =
  | 'and'
  | 'or'
  | 'xor'
  | 'not'
  | 'buf'
  | 'mux'
  | 'register'
  | 'latch'
  | 'op'
  | 'module'
  | 'input'
  | 'output'
  | 'const'
  | 'box';

export interface RtlSrc {
  file: string;
  line: number;
}

export interface RtlPin {
  /** Yosys port name (or a derived name such as "B#3" for a case input of a $pmux). */
  name: string;
  dir: 'in' | 'out';
  side: 'W' | 'E' | 'S' | 'N';
  /** Pin position on the symbol's border, relative to its top-left corner. */
  x: number;
  y: number;
  bits: RtlBit[];
  /** Text drawn next to the pin inside the symbol ("" for none). */
  label: string;
  /** Inverting bubble (active-low input or inverted output). */
  negated?: boolean;
  /** Clock input (drawn with a triangle). */
  clock?: boolean;
}

export interface RtlNode {
  id: string;
  shape: RtlShape;
  /** Yosys cell type ("$add", "$_AND_", "CounterUnit", ...). */
  type: string;
  /** Instance, register, port or constant text shown on the symbol. */
  name: string;
  /** Second line: the module of an instance, the operator of an arithmetic block, ... */
  detail?: string;
  /** For module instances: the Yosys module to open on double-click. */
  module?: string;
  width: number;
  height: number;
  pins: RtlPin[];
  src?: RtlSrc;
}

export interface RtlEdge {
  id: string;
  source: string;
  sourcePin: string;
  target: string;
  targetPin: string;
  bits: RtlBit[];
  /** Signal name ("Count", "phase[0]") when the wire has one. */
  name?: string;
  /** Draw the name on this wire (one label per driver and signal). */
  showLabel: boolean;
  src?: RtlSrc;
}

export interface RtlModuleView {
  /** Yosys module name (unique key). */
  name: string;
  /** Readable name: "Mux2Way4", or "Counter (WIDTH=8)" for a parameterised copy. */
  displayName: string;
  src?: RtlSrc;
  nodes: RtlNode[];
  edges: RtlEdge[];
  /** Number of logic symbols (not ports, constants or module instances). */
  logicCount: number;
}

export interface RtlNetlist {
  mode: RtlMode;
  top: string;
  modules: Record<string, RtlModuleView>;
}

export interface RtlNetlistResult {
  ok: boolean;
  messages: Message[];
  netlist?: RtlNetlist;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Yosys scripts

/** Map every remaining fine-grained gate to AND, OR, XOR and NOT (gate-only view). */
export const GATE_MAP_FILE = 'nl_gate_map.v';
export const GATE_MAP_VERILOG = `// NanoLogic: express every gate with AND, OR, XOR and NOT.
module \\$_MUX_ (A, B, S, Y); input A, B, S; output Y; wire ns, a, b;
  \\$_NOT_ n (.A(S), .Y(ns)); \\$_AND_ g0 (.A(A), .B(ns), .Y(a)); \\$_AND_ g1 (.A(B), .B(S), .Y(b)); \\$_OR_ g2 (.A(a), .B(b), .Y(Y));
endmodule
module \\$_NMUX_ (A, B, S, Y); input A, B, S; output Y; wire ns, a, b, o;
  \\$_NOT_ n (.A(S), .Y(ns)); \\$_AND_ g0 (.A(A), .B(ns), .Y(a)); \\$_AND_ g1 (.A(B), .B(S), .Y(b)); \\$_OR_ g2 (.A(a), .B(b), .Y(o)); \\$_NOT_ n2 (.A(o), .Y(Y));
endmodule
module \\$_NAND_ (A, B, Y); input A, B; output Y; wire t; \\$_AND_ g (.A(A), .B(B), .Y(t)); \\$_NOT_ n (.A(t), .Y(Y)); endmodule
module \\$_NOR_ (A, B, Y); input A, B; output Y; wire t; \\$_OR_ g (.A(A), .B(B), .Y(t)); \\$_NOT_ n (.A(t), .Y(Y)); endmodule
module \\$_XNOR_ (A, B, Y); input A, B; output Y; wire t; \\$_XOR_ g (.A(A), .B(B), .Y(t)); \\$_NOT_ n (.A(t), .Y(Y)); endmodule
module \\$_ANDNOT_ (A, B, Y); input A, B; output Y; wire nb; \\$_NOT_ n (.A(B), .Y(nb)); \\$_AND_ g (.A(A), .B(nb), .Y(Y)); endmodule
module \\$_ORNOT_ (A, B, Y); input A, B; output Y; wire nb; \\$_NOT_ n (.A(B), .Y(nb)); \\$_OR_ g (.A(A), .B(nb), .Y(Y)); endmodule
module \\$_AOI3_ (A, B, C, Y); input A, B, C; output Y; wire t, u;
  \\$_AND_ g0 (.A(A), .B(B), .Y(t)); \\$_OR_ g1 (.A(t), .B(C), .Y(u)); \\$_NOT_ n (.A(u), .Y(Y));
endmodule
module \\$_OAI3_ (A, B, C, Y); input A, B, C; output Y; wire t, u;
  \\$_OR_ g0 (.A(A), .B(B), .Y(t)); \\$_AND_ g1 (.A(t), .B(C), .Y(u)); \\$_NOT_ n (.A(u), .Y(Y));
endmodule
module \\$_AOI4_ (A, B, C, D, Y); input A, B, C, D; output Y; wire t, u, v;
  \\$_AND_ g0 (.A(A), .B(B), .Y(t)); \\$_AND_ g1 (.A(C), .B(D), .Y(u)); \\$_OR_ g2 (.A(t), .B(u), .Y(v)); \\$_NOT_ n (.A(v), .Y(Y));
endmodule
module \\$_OAI4_ (A, B, C, D, Y); input A, B, C, D; output Y; wire t, u, v;
  \\$_OR_ g0 (.A(A), .B(B), .Y(t)); \\$_OR_ g1 (.A(C), .B(D), .Y(u)); \\$_AND_ g2 (.A(t), .B(u), .Y(v)); \\$_NOT_ n (.A(v), .Y(Y));
endmodule
`;

/**
 * Yosys commands (after read_verilog) for each view. Hierarchy is kept so each
 * module can be opened on its own. The RTL view stops after "proc", so
 * operators, multiplexers and registers stay as written; the gate view breaks
 * everything down to single-bit gates and flip-flops.
 */
export function rtlYosysScript(top: string, mode: RtlMode): string[] {
  // -norom: keep constant case tables as multiplexers (Quartus's RTL Viewer shows them that way).
  const common = [`hierarchy -check -top ${top}`, 'proc -norom', 'opt_clean'];
  if (mode === 'rtl') return common;
  return [...common, 'techmap', 'opt_expr', 'opt_clean', `techmap -map ${GATE_MAP_FILE}`, 'opt_clean'];
}

// ---------------------------------------------------------------------------
// Symbol geometry (pixels; the viewer draws at this scale before zooming)

const CHAR = 6.2; // JetBrains Mono at 10 px
const PIN = 16; // pin pitch on module and register symbols
const GATE_PITCH = 12;
const textWidth = (s: string) => Math.ceil(s.length * CHAR);

/** Readable module name for Yosys's derived names ("$paramod\\Mux\\W=4" -> "Mux (W=4)"). */
export function displayModuleName(name: string): string {
  const m = /^\$paramod(?:\$[0-9a-f]+)?\\([^\\]+)(.*)$/.exec(name);
  if (!m) return name.replace(/^\\/, '');
  const params = m[2]
    .split('\\')
    .filter(Boolean)
    .map((p) => p.replace(/=(?:\d+'|)([01]+)$/, (_, bits: string) => `=${parseInt(bits, 2)}`))
    .join(', ');
  return params ? `${m[1]} (${params})` : m[1];
}

const GATES: Record<string, { shape: RtlShape; negY?: boolean; negB?: boolean; symbol?: string }> = {
  $and: { shape: 'and' },
  $_AND_: { shape: 'and' },
  $_NAND_: { shape: 'and', negY: true },
  $_ANDNOT_: { shape: 'and', negB: true },
  $logic_and: { shape: 'and', symbol: '&&' },
  $reduce_and: { shape: 'and', symbol: '&' },
  $or: { shape: 'or' },
  $_OR_: { shape: 'or' },
  $_NOR_: { shape: 'or', negY: true },
  $_ORNOT_: { shape: 'or', negB: true },
  $logic_or: { shape: 'or', symbol: '||' },
  $reduce_or: { shape: 'or', symbol: '|' },
  $reduce_bool: { shape: 'or', symbol: '|' },
  $xor: { shape: 'xor' },
  $_XOR_: { shape: 'xor' },
  $reduce_xor: { shape: 'xor', symbol: '^' },
  $xnor: { shape: 'xor', negY: true },
  $_XNOR_: { shape: 'xor', negY: true },
  $reduce_xnor: { shape: 'xor', negY: true, symbol: '~^' },
  $not: { shape: 'not' },
  $_NOT_: { shape: 'not' },
  $logic_not: { shape: 'not', symbol: '!' },
  $pos: { shape: 'buf' },
  $_BUF_: { shape: 'buf' },
};

const OPS: Record<string, string> = {
  $add: '+',
  $sub: '−',
  $mul: '×',
  $div: '÷',
  $mod: '%',
  $divfloor: '÷',
  $modfloor: '%',
  $pow: '**',
  $neg: '−',
  $shl: '<<',
  $shr: '>>',
  $sshl: '<<<',
  $sshr: '>>>',
  $shift: '>>',
  $shiftx: '>>',
  $eq: '=',
  $eqx: '===',
  $ne: '≠',
  $nex: '!==',
  $lt: '<',
  $le: '≤',
  $gt: '>',
  $ge: '≥',
};

// Fine-grained flip-flops and latches: "$_DFF_PN0_" -> family DFF, letters P N 0.
// The letters give, in order, the polarity of these control pins (and reset values).
const FF_FAMILIES: Record<string, { pins: string[]; latch?: boolean }[]> = {
  DFF: [{ pins: ['C'] }, { pins: ['C', 'R', '='] }],
  DFFE: [{ pins: ['C', 'E'] }, { pins: ['C', 'R', '=', 'E'] }],
  SDFF: [{ pins: ['C', 'R', '='] }],
  SDFFE: [{ pins: ['C', 'R', '=', 'E'] }],
  SDFFCE: [{ pins: ['C', 'R', '=', 'E'] }],
  DFFSR: [{ pins: ['C', 'S', 'R'] }],
  DFFSRE: [{ pins: ['C', 'S', 'R', 'E'] }],
  ALDFF: [{ pins: ['C', 'L'] }],
  ALDFFE: [{ pins: ['C', 'L', 'E'] }],
  DLATCH: [{ pins: ['E'], latch: true }, { pins: ['E', 'R', '='], latch: true }],
  DLATCHSR: [{ pins: ['E', 'S', 'R'], latch: true }],
};

interface FfInfo {
  latch: boolean;
  /** Pin name -> active low. */
  activeLow: Record<string, boolean>;
}

function fineFlipFlop(type: string): FfInfo | undefined {
  const m = /^\$_(DFF|DFFE|SDFF|SDFFE|SDFFCE|DFFSR|DFFSRE|ALDFF|ALDFFE|DLATCH|DLATCHSR)_([PN01]+)_$/.exec(type);
  if (!m) return undefined;
  const variant = FF_FAMILIES[m[1]].find((v) => v.pins.length === m[2].length);
  if (!variant) return undefined;
  const activeLow: Record<string, boolean> = {};
  variant.pins.forEach((p, i) => {
    if (p !== '=') activeLow[p] = m[2][i] === 'N';
  });
  return { latch: !!variant.latch, activeLow };
}

/** Coarse-grained registers: which pins they have and their polarity parameters. */
function coarseRegister(type: string, params: Record<string, string | number>): FfInfo | undefined {
  const pol = (name: string) => paramInt(params[name], 1) === 0;
  const latch = type === '$dlatch' || type === '$adlatch' || type === '$dlatchsr';
  if (!latch && !/^\$(dff|dffe|adff|adffe|sdff|sdffe|sdffce|dffsr|dffsre|aldff|aldffe)$/.test(type)) return undefined;
  return {
    latch,
    activeLow: {
      CLK: pol('CLK_POLARITY'),
      EN: pol('EN_POLARITY'),
      ARST: pol('ARST_POLARITY'),
      SRST: pol('SRST_POLARITY'),
      SET: pol('SET_POLARITY'),
      CLR: pol('CLR_POLARITY'),
      ALOAD: pol('ALOAD_POLARITY'),
    },
  };
}

// Readable labels for register control pins.
const REG_PIN_LABEL: Record<string, string> = {
  D: 'D',
  C: 'CLK',
  CLK: 'CLK',
  E: 'EN',
  EN: 'EN',
  R: 'RST',
  ARST: 'RST',
  SRST: 'SRST',
  S: 'SET',
  SET: 'SET',
  CLR: 'CLR',
  L: 'LOAD',
  ALOAD: 'LOAD',
  AD: 'AD',
  Q: 'Q',
};
const REG_PIN_ORDER = ['D', 'AD', 'E', 'EN', 'L', 'ALOAD', 'C', 'CLK', 'S', 'SET', 'R', 'ARST', 'SRST', 'CLR'];

// ---------------------------------------------------------------------------
// Building one module view

interface CellPort {
  name: string;
  dir: 'in' | 'out';
  bits: RtlBit[];
}

function cellPorts(cell: YosysCell, def?: YosysModule): CellPort[] {
  const names = Object.keys(cell.connections);
  // Instances keep the order the ports were declared in.
  if (def) {
    const order = Object.keys(def.ports);
    names.sort((a, b) => (order.indexOf(a) + 1 || 1e9) - (order.indexOf(b) + 1 || 1e9));
  }
  return names.map((name) => {
    const d = cell.port_directions?.[name] ?? def?.ports[name]?.direction ?? (/^(Y|Q|O|OUT)$/.test(name) ? 'output' : 'input');
    return { name, dir: d === 'output' ? 'out' : 'in', bits: cell.connections[name] };
  });
}

function formatConst(bits: RtlBit[]): string {
  const w = bits.length;
  const s = [...bits].reverse().join('');
  if (/[xz]/.test(s) || w <= 8) return `${w}'b${s}`;
  return `${w}'h${BigInt('0b' + s).toString(16).toUpperCase()}`;
}

/** A plain bus label: "name", "name[3]" or "name[3:1]", honouring the declared range. */
function sliceLabel(nn: YosysNetname, name: string, from: number, count: number): string {
  const width = nn.bits.length;
  const offset = nn.offset ?? 0;
  const idx = (i: number) => (nn.upto ? offset + (width - 1 - i) : offset + i);
  if (count === width && width === 1 && offset === 0) return name;
  if (count === width) return name;
  const lo = idx(from);
  const hi = idx(from + count - 1);
  return count === 1 ? `${name}[${lo}]` : `${name}[${Math.max(lo, hi)}:${Math.min(lo, hi)}]`;
}

class NameIndex {
  private byBit = new Map<RtlBit, { name: string; nn: YosysNetname; i: number }[]>();

  constructor(netnames: Record<string, YosysNetname>) {
    for (const [name, nn] of Object.entries(netnames)) {
      if (nn.hide_name || name.startsWith('$')) continue;
      nn.bits.forEach((b, i) => {
        if (typeof b !== 'number') return;
        const list = this.byBit.get(b) ?? [];
        list.push({ name, nn, i });
        this.byBit.set(b, list);
      });
    }
  }

  /** The tightest named signal that holds `bits` in order, or a concatenation. */
  label(bits: RtlBit[]): { name?: string; nn?: YosysNetname } {
    if (!bits.length || typeof bits[0] !== 'number') return {};
    let best: { name: string; nn: YosysNetname; i: number } | undefined;
    for (const c of this.byBit.get(bits[0]) ?? []) {
      if (c.i + bits.length > c.nn.bits.length) continue;
      if (!bits.every((b, k) => c.nn.bits[c.i + k] === b)) continue;
      if (!best || c.nn.bits.length < best.nn.bits.length || (c.nn.bits.length === best.nn.bits.length && c.name.length < best.name.length)) best = c;
    }
    if (best) return { name: sliceLabel(best.nn, best.name, best.i, bits.length), nn: best.nn };
    // Not one signal: describe it as a concatenation of runs (MSB first, like Verilog).
    const parts: string[] = [];
    let k = 0;
    while (k < bits.length) {
      let run = 1;
      let label = '?';
      const cands = typeof bits[k] === 'number' ? this.byBit.get(bits[k]) ?? [] : [];
      if (cands.length) {
        const c = cands.reduce((a, b) => (b.nn.bits.length < a.nn.bits.length ? b : a));
        while (k + run < bits.length && c.nn.bits[c.i + run] === bits[k + run]) run++;
        label = sliceLabel(c.nn, c.name, c.i, run);
      } else if (typeof bits[k] !== 'number') {
        while (k + run < bits.length && typeof bits[k + run] !== 'number') run++;
        label = formatConst(bits.slice(k, k + run));
      } else {
        while (k + run < bits.length && typeof bits[k + run] === 'number' && !(this.byBit.get(bits[k + run]) ?? []).length) run++;
        label = '';
      }
      parts.unshift(label);
      k += run;
    }
    if (parts.every((p) => p === '')) return {};
    return { name: `{${parts.map((p) => p || '…').join(', ')}}` };
  }
}

function pinsAlong(names: { name: string; bits: RtlBit[]; dir: 'in' | 'out' }[], side: 'W' | 'E', x: number, top: number, pitch: number): RtlPin[] {
  return names.map((p, i) => ({ name: p.name, dir: p.dir, side, x, y: top + pitch * i + pitch / 2, bits: p.bits, label: p.name }));
}

function srcOf(attrs: Record<string, string | number> | undefined, toDisplay: (f: string) => string): RtlSrc | undefined {
  const s = parseSrcAttribute(attrs?.src);
  return s ? { file: toDisplay(s.file), line: s.line } : undefined;
}

function buildNode(
  id: string,
  cellName: string,
  cell: YosysCell,
  design: YosysDesign,
  names: NameIndex,
  toDisplay: (f: string) => string,
): RtlNode {
  const def = design.modules[cell.type];
  const ports = cellPorts(cell, def);
  const src = srcOf(cell.attributes, toDisplay);
  const inputs = ports.filter((p) => p.dir === 'in');
  const outputs = ports.filter((p) => p.dir === 'out');
  const shortName = cell.hide_name ? '' : cellName.replace(/^\\/, '');

  // Module instance.
  if (def) {
    const inW = Math.max(0, ...inputs.map((p) => textWidth(p.name)));
    const outW = Math.max(0, ...outputs.map((p) => textWidth(p.name)));
    const title = displayModuleName(cell.type);
    const width = Math.max(110, inW + outW + 36, textWidth(shortName) + 20, textWidth(title) + 20);
    const header = 36;
    const rows = Math.max(inputs.length, outputs.length, 1);
    const height = header + rows * PIN + 8;
    return {
      id,
      shape: 'module',
      type: cell.type,
      name: shortName || title,
      detail: title,
      module: cell.type,
      width,
      height,
      pins: [...pinsAlong(inputs, 'W', 0, header, PIN), ...pinsAlong(outputs, 'E', width, header, PIN)],
      src,
    };
  }

  // Gates.
  const g = GATES[cell.type];
  if (g) {
    const ins = inputs.length ? inputs : [{ name: 'A', dir: 'in' as const, bits: [] }];
    const narrow = g.shape === 'not' || g.shape === 'buf';
    const width = narrow ? 30 : 40;
    const height = narrow ? 20 : Math.max(26, ins.length * GATE_PITCH + 8);
    const pins: RtlPin[] = ins.map((p, i) => ({
      name: p.name,
      dir: 'in',
      side: 'W',
      x: 0,
      y: narrow ? height / 2 : height / 2 + (i - (ins.length - 1) / 2) * GATE_PITCH,
      bits: p.bits,
      label: '',
      negated: g.negB && p.name === 'B',
    }));
    for (const p of outputs) pins.push({ name: p.name, dir: 'out', side: 'E', x: width, y: height / 2, bits: p.bits, label: '', negated: g.negY });
    return { id, shape: g.shape, type: cell.type, name: shortName, detail: g.symbol, width, height, pins, src };
  }

  // Multiplexers. $pmux case inputs are split into one pin per case.
  if (cell.type === '$mux' || cell.type === '$_MUX_' || cell.type === '$_NMUX_' || cell.type === '$pmux') {
    const w = cell.type === '$pmux' ? paramInt(cell.parameters.WIDTH, 1) : (cell.connections.A ?? []).length;
    const a = cell.connections.A ?? [];
    const b = cell.connections.B ?? [];
    const dataIns: { name: string; bits: RtlBit[]; label: string }[] =
      cell.type === '$pmux'
        ? [
            { name: 'A', bits: a, label: 'else' },
            ...Array.from({ length: Math.max(1, Math.floor(b.length / Math.max(w, 1))) }, (_, i) => ({ name: `B#${i}`, bits: b.slice(i * w, (i + 1) * w), label: `S${i}` })),
          ]
        : [
            { name: 'A', bits: a, label: '0' },
            { name: 'B', bits: b, label: '1' },
          ];
    const width = cell.type === '$pmux' ? 44 : 34;
    const height = dataIns.length * 18 + 22;
    const pins: RtlPin[] = dataIns.map((d, i) => ({ name: d.name, dir: 'in', side: 'W', x: 0, y: 12 + i * 18 + 9, bits: d.bits, label: d.label }));
    pins.push({ name: 'S', dir: 'in', side: 'S', x: width / 2, y: height, bits: cell.connections.S ?? [], label: '' });
    pins.push({ name: 'Y', dir: 'out', side: 'E', x: width, y: height / 2, bits: cell.connections.Y ?? [], label: '', negated: cell.type === '$_NMUX_' });
    return { id, shape: 'mux', type: cell.type, name: shortName, detail: cell.type === '$pmux' ? 'case' : undefined, width, height, pins, src };
  }

  // Registers and latches (coarse in the RTL view, single-bit in the gate view).
  const ff = fineFlipFlop(cell.type) ?? coarseRegister(cell.type, cell.parameters);
  if (ff) {
    const q = outputs.find((p) => p.name === 'Q') ?? outputs[0];
    const regName = names.label(q?.bits ?? []).name ?? shortName;
    const ins = [...inputs].sort((x, y) => (REG_PIN_ORDER.indexOf(x.name) + 1 || 99) - (REG_PIN_ORDER.indexOf(y.name) + 1 || 99));
    const header = 18;
    const width = Math.max(64, textWidth(regName) + 16);
    const height = header + Math.max(ins.length, 2) * PIN + 6;
    const pins: RtlPin[] = ins.map((p, i) => ({
      name: p.name,
      dir: 'in',
      side: 'W',
      x: 0,
      y: header + i * PIN + PIN / 2,
      bits: p.bits,
      label: REG_PIN_LABEL[p.name] ?? p.name,
      negated: !!ff.activeLow[p.name],
      clock: !ff.latch && (p.name === 'C' || p.name === 'CLK'),
    }));
    for (const p of outputs) pins.push({ name: p.name, dir: 'out', side: 'E', x: width, y: header + PIN / 2, bits: p.bits, label: REG_PIN_LABEL[p.name] ?? p.name });
    return { id, shape: ff.latch ? 'latch' : 'register', type: cell.type, name: regName, detail: ff.latch ? 'latch' : undefined, width, height, pins, src };
  }

  // Arithmetic and comparison.
  const op = OPS[cell.type];
  if (op) {
    const width = 46;
    const height = Math.max(36, inputs.length * PIN + 12);
    const top = (height - inputs.length * PIN) / 2;
    const pins = [
      ...inputs.map((p, i) => ({ name: p.name, dir: 'in' as const, side: 'W' as const, x: 0, y: top + i * PIN + PIN / 2, bits: p.bits, label: inputs.length > 1 ? p.name : '' })),
      ...outputs.map((p) => ({ name: p.name, dir: 'out' as const, side: 'E' as const, x: width, y: height / 2, bits: p.bits, label: '' })),
    ];
    return { id, shape: 'op', type: cell.type, name: shortName, detail: op, width, height, pins, src };
  }

  // Anything else: a box with the cell type and its pin names.
  const title = cell.type.replace(/^\$_?/, '').replace(/_$/, '');
  const inW = Math.max(0, ...inputs.map((p) => textWidth(p.name)));
  const outW = Math.max(0, ...outputs.map((p) => textWidth(p.name)));
  const width = Math.max(70, inW + outW + 30, textWidth(title) + 16);
  const header = 20;
  const height = header + Math.max(inputs.length, outputs.length, 1) * PIN + 6;
  return {
    id,
    shape: 'box',
    type: cell.type,
    name: shortName,
    detail: title,
    width,
    height,
    pins: [...pinsAlong(inputs, 'W', 0, header, PIN), ...pinsAlong(outputs, 'E', width, header, PIN)],
    src,
  };
}

interface Driver {
  node: string;
  pin: string;
}

/** Build the drawable view of one module. */
export function buildModuleView(design: YosysDesign, name: string, toDisplay: (f: string) => string = (f) => f): RtlModuleView {
  const mod = design.modules[name];
  const names = new NameIndex(mod.netnames);
  const nodes: RtlNode[] = [];
  const edges: RtlEdge[] = [];

  // Module ports become pins at the edge of the drawing.
  for (const [pname, p] of Object.entries(mod.ports)) {
    const label = p.bits.length > 1 ? `${pname}[${(p.offset ?? 0) + p.bits.length - 1}:${p.offset ?? 0}]` : pname;
    const width = textWidth(label) + 26;
    const src = srcOf(mod.netnames[pname]?.attributes, toDisplay);
    if (p.direction === 'output') {
      nodes.push({ id: `o:${pname}`, shape: 'output', type: 'output', name: pname, detail: label, width, height: 20, pins: [{ name: pname, dir: 'in', side: 'W', x: 0, y: 10, bits: p.bits, label: '' }], src });
    } else {
      nodes.push({ id: `i:${pname}`, shape: 'input', type: p.direction, name: pname, detail: label, width, height: 20, pins: [{ name: pname, dir: 'out', side: 'E', x: width, y: 10, bits: p.bits, label: '' }], src });
    }
  }
  const cellIds = new Map<string, string>();
  let n = 0;
  for (const [cname, cell] of Object.entries(mod.cells)) {
    const id = `c${n++}`;
    cellIds.set(cname, id);
    nodes.push(buildNode(id, cname, cell, design, names, toDisplay));
  }

  // Who drives each bit.
  const drivers = new Map<RtlBit, Driver & { index: number }>();
  for (const node of nodes) {
    for (const pin of node.pins) {
      if (pin.dir !== 'out') continue;
      pin.bits.forEach((b, index) => {
        if (typeof b === 'number' && !drivers.has(b)) drivers.set(b, { node: node.id, pin: pin.name, index });
      });
    }
  }

  // One wire per (driver pin, load pin), carrying the bits they share, in load order.
  let constN = 0;
  const edgeByKey = new Map<string, RtlEdge>();
  for (const node of [...nodes]) {
    for (const pin of node.pins) {
      if (pin.dir !== 'in') continue;
      let k = 0;
      while (k < pin.bits.length) {
        const b = pin.bits[k];
        if (typeof b !== 'number') {
          // A run of constant bits becomes a constant symbol.
          let run = 1;
          while (k + run < pin.bits.length && typeof pin.bits[k + run] !== 'number') run++;
          const bits = pin.bits.slice(k, k + run);
          const text = formatConst(bits);
          const cid = `k${constN++}`;
          const width = textWidth(text) + 12;
          nodes.push({ id: cid, shape: 'const', type: 'const', name: text, width, height: 18, pins: [{ name: 'Y', dir: 'out', side: 'E', x: width, y: 9, bits, label: '' }] });
          edges.push({ id: `e${edges.length}`, source: cid, sourcePin: 'Y', target: node.id, targetPin: pin.name, bits, showLabel: false });
          k += run;
          continue;
        }
        const d = drivers.get(b);
        if (!d) {
          k++;
          continue;
        }
        const key = `${d.node}|${d.pin}|${node.id}|${pin.name}`;
        let e = edgeByKey.get(key);
        if (!e) {
          e = { id: `e${edges.length}`, source: d.node, sourcePin: d.pin, target: node.id, targetPin: pin.name, bits: [], showLabel: false };
          edgeByKey.set(key, e);
          edges.push(e);
        }
        e.bits.push(b);
        k++;
      }
    }
  }

  // Names, and one visible label per driver and signal (not when the pins already say it).
  const labelled = new Set<string>();
  const byId = new Map(nodes.map((x) => [x.id, x]));
  for (const e of edges) {
    if (e.source.startsWith('k')) continue;
    const { name: label, nn } = names.label(e.bits);
    if (!label) continue;
    e.name = label;
    e.src = srcOf(nn?.attributes, toDisplay);
    const src = byId.get(e.source)!;
    const dst = byId.get(e.target)!;
    const redundant = (src.shape === 'input' && src.name === label) || (dst.shape === 'output' && dst.name === label);
    const key = `${e.source}|${e.sourcePin}|${label}`;
    if (!redundant && !labelled.has(key)) {
      labelled.add(key);
      e.showLabel = true;
    }
  }

  const logicCount = nodes.filter((x) => !['input', 'output', 'const', 'module'].includes(x.shape)).length;
  return { name, displayName: displayModuleName(name), src: srcOf(mod.attributes, toDisplay), nodes, edges, logicCount };
}

/** Views of every module in the design. */
export function buildRtlNetlist(design: YosysDesign, top: string, mode: RtlMode, toDisplay: (f: string) => string = (f) => f): RtlNetlist {
  const modules: Record<string, RtlModuleView> = {};
  for (const name of Object.keys(design.modules)) modules[name] = buildModuleView(design, name, toDisplay);
  const topName = modules[top] ? top : (Object.keys(design.modules).find((m) => design.modules[m].attributes?.top) ?? top);
  return { mode, top: topName, modules };
}

/** Follow instance names from the top module ("core", "Counter1", ...) to a module view. */
export function resolveInstancePath(netlist: RtlNetlist, path: string[]): { module: string; path: string[] } {
  let module = netlist.top;
  const ok: string[] = [];
  for (const inst of path) {
    const node = netlist.modules[module]?.nodes.find((x) => x.shape === 'module' && x.name === inst);
    if (!node?.module || !netlist.modules[node.module]) break;
    module = node.module;
    ok.push(inst);
  }
  return { module, path: ok };
}
