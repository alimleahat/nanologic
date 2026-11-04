// Compiles a flattened Yosys JSON netlist into a JavaScript cycle simulator.
//
// The netlist is expected to come from the script in VIRTUAL_BOARD_YOSYS_SCRIPT
// (proc, flatten, memory_map, dffunmap, pmuxtree ...), which leaves a small set
// of word-level cells. Each cell output becomes a JavaScript variable; signals up
// to 32 bits wide are stored as unsigned numbers, wider ones as BigInts. The
// combinational logic is emitted as straight-line code in topological order and
// compiled with `new Function`, which is far faster than interpreting the netlist
// and makes "max speed" fast enough for 50 MHz clock dividers to be watchable.
//
// x and z are treated as 0: the virtual board is two-valued like real hardware.

import { paramInt, parseSrcAttribute, type YosysBit, type YosysCell, type YosysDesign, type YosysModule } from './yosysJson';

export type SimValue = number | bigint;

export interface SimPortInfo {
  name: string;
  width: number;
  direction: 'input' | 'output' | 'inout';
  /** Index of the least significant bit as declared (e.g. 0 for [7:0]). */
  offset: number;
  upto: boolean;
}

export interface SimNetInfo {
  name: string;
  width: number;
  /** True when the net is driven by a flip-flop or latch (a good bypass candidate). */
  registered: boolean;
}

/** Replace an internal net with a value driven by the app (the "divider bypass"). */
export interface NetOverride {
  net: string;
  /** "clock": driven by the board clock; "high"/"low": held at all-ones/zero. */
  mode: 'clock' | 'high' | 'low';
}

export interface CompiledSimulator {
  readonly top: string;
  readonly inputs: SimPortInfo[];
  readonly outputs: SimPortInfo[];
  readonly nets: SimNetInfo[];
  readonly overrides: NetOverride[];
  /** Cell types that were present but ignored (e.g. $print from $display). */
  readonly ignoredCells: string[];
  setInput(name: string, value: SimValue): void;
  getInput(name: string): SimValue;
  /** Set the value of all "clock"-mode overrides. */
  setOverrideClock(value: 0 | 1): void;
  /** Propagate inputs through combinational logic, flip-flops and latches until stable. */
  settle(): void;
  getOutput(name: string): SimValue;
  getOutputs(): Record<string, SimValue>;
  /** Write every output's value into `into`, in the order of `outputs` (no allocation). */
  readOutputs(into: SimValue[]): void;
  getNet(name: string): SimValue;
  /** Restore power-up state (initial values, or zero). */
  reset(): void;
}

export class NetlistError extends Error {
  constructor(
    message: string,
    readonly file?: string,
    readonly line?: number,
  ) {
    super(message);
  }
}

/** Yosys commands run (after reading the sources) to produce a netlist for compileNetlist(). */
export function virtualBoardYosysScript(top: string): string[] {
  return [
    `hierarchy -check -top ${top}`,
    'proc',
    'flatten',
    'opt_expr',
    'opt_clean',
    'memory -nomap',
    'memory_map',
    'opt -nodffe -nosdff',
    'dffunmap',
    'pmuxtree',
    'bmuxmap',
    'demuxmap',
    'opt_clean',
  ];
}

// ---------------------------------------------------------------------------
// Code generation helpers

interface Var {
  name: string;
  width: number;
  big: boolean;
}

interface Expr {
  code: string;
  width: number;
  big: boolean;
}

const MAX_SMALL = 32;

function isBig(width: number): boolean {
  return width > MAX_SMALL;
}

function maskNum(width: number): string {
  return width >= 32 ? '0xFFFFFFFF' : String(2 ** width - 1);
}

/** Truncate a number-domain expression to `width` bits (unsigned result). */
function mN(code: string, width: number): string {
  if (width >= 32) return `((${code}) >>> 0)`;
  return `((${code}) & ${maskNum(width)})`;
}

/** Truncate a BigInt-domain expression to `width` bits (unsigned result). */
function mB(code: string, width: number): string {
  return `BigInt.asUintN(${width}, ${code})`;
}

function toBig(e: Expr): string {
  return e.big ? e.code : `BigInt(${e.code})`;
}

function toNum(e: Expr): string {
  return e.big ? `Number(BigInt.asUintN(32, ${e.code}))` : e.code;
}

/** Extend expression `e` to `width` bits in the given domain (sign-extending if signed). */
function ext(e: Expr, width: number, signed: boolean, big: boolean): string {
  if (big) {
    const b = toBig(e);
    if (signed && e.width < width) return mB(`BigInt.asIntN(${e.width}, ${b})`, width);
    return b;
  }
  const n = toNum(e);
  if (signed && e.width < width && e.width > 0) {
    const sh = 32 - e.width;
    return mN(`((${n}) << ${sh}) >> ${sh}`, width);
  }
  return n;
}

/** Signed interpretation of a value of `width` bits, as int32 number or BigInt. */
function sval(e: Expr, big: boolean): string {
  if (big) return `BigInt.asIntN(${e.width}, ${toBig(e)})`;
  const sh = 32 - e.width;
  return sh === 0 ? `((${e.code}) | 0)` : `(((${e.code}) << ${sh}) >> ${sh})`;
}

function zero(big: boolean): string {
  return big ? '0n' : '0';
}

// ---------------------------------------------------------------------------

const STATEFUL = new Set(['$dff', '$adff', '$dffsr', '$aldff', '$dlatch', '$adlatch', '$sr', '$ff']);

const IGNORED = new Set([
  '$scopeinfo',
  '$print',
  '$check',
  '$assert',
  '$assume',
  '$cover',
  '$live',
  '$fair',
  '$equiv',
  '$initstate',
  '$anyconst',
  '$anyseq',
  '$allconst',
  '$allseq',
  '$specify2',
  '$specify3',
  '$specrule',
]);

interface StateCell {
  name: string;
  cell: YosysCell;
  q: Var;
}

export function compileNetlist(design: YosysDesign, top: string, overrides: NetOverride[] = []): CompiledSimulator {
  const mod: YosysModule | undefined = design.modules[top];
  if (!mod) throw new NetlistError(`Top-level module "${top}" not found in netlist`);
  for (const [name, cell] of Object.entries(mod.cells)) {
    if (design.modules[cell.type] && !cell.type.startsWith('$')) {
      throw new NetlistError(`Netlist is not flattened: cell ${name} instantiates ${cell.type}`);
    }
  }

  const vars: Var[] = [];
  const newVar = (prefix: string, width: number): Var => {
    const v = { name: `${prefix}${vars.length}`, width, big: isBig(width) };
    vars.push(v);
    return v;
  };

  // Which variable/bit drives each net bit.
  const driver = new Map<number, { v: Var; bit: number }>();
  const inputVars = new Map<string, Var>();
  const inputs: SimPortInfo[] = [];
  const outputs: SimPortInfo[] = [];

  for (const [name, port] of Object.entries(mod.ports)) {
    const info: SimPortInfo = {
      name,
      width: port.bits.length,
      direction: port.direction,
      offset: port.offset ?? 0,
      upto: !!port.upto,
    };
    if (port.direction === 'input' || port.direction === 'inout') {
      const v = newVar('i', port.bits.length);
      inputVars.set(name, v);
      port.bits.forEach((b, i) => {
        if (typeof b === 'number') driver.set(b, { v, bit: i });
      });
      inputs.push(info);
    }
    if (port.direction === 'output') outputs.push(info);
  }

  const ignoredCells = new Set<string>();
  const combCells: { name: string; cell: YosysCell; y: Var }[] = [];
  const stateCells: StateCell[] = [];
  for (const [name, cell] of Object.entries(mod.cells)) {
    if (IGNORED.has(cell.type)) {
      ignoredCells.add(cell.type);
      continue;
    }
    const outPort = STATEFUL.has(cell.type) ? 'Q' : 'Y';
    const outBits = cell.connections[outPort];
    if (!outBits) {
      const src = parseSrcAttribute(cell.attributes?.src);
      throw new NetlistError(`Unsupported cell type ${cell.type} (${name})`, src?.file, src?.line);
    }
    const v = newVar(STATEFUL.has(cell.type) ? 'q' : 'w', outBits.length);
    outBits.forEach((b, i) => {
      if (typeof b === 'number') driver.set(b, { v, bit: i });
    });
    if (STATEFUL.has(cell.type)) stateCells.push({ name, cell, q: v });
    else combCells.push({ name, cell, y: v });
  }

  const registeredBits = new Set<number>();
  for (const sc of stateCells) for (const b of sc.cell.connections.Q) if (typeof b === 'number') registeredBits.add(b);

  // Overrides replace the driver of a named net's bits with an app-controlled variable.
  const overrideVars: { o: NetOverride; v: Var }[] = [];
  for (const o of overrides) {
    const net = mod.netnames[o.net];
    if (!net) throw new NetlistError(`Cannot bypass "${o.net}": no such signal in the netlist`);
    const v = newVar('o', net.bits.length);
    net.bits.forEach((b, i) => {
      if (typeof b === 'number') driver.set(b, { v, bit: i });
    });
    overrideVars.push({ o, v });
  }

  /** Build an expression for a list of bits (LSB first). */
  const sig = (bits: YosysBit[], deps?: Set<Var>): Expr => {
    const width = bits.length;
    const big = isBig(width);
    if (width === 0) return { code: '0', width: 0, big: false };
    const parts: string[] = [];
    let constBits = 0n;
    let i = 0;
    while (i < width) {
      const b = bits[i];
      if (typeof b !== 'number') {
        if (b === '1') constBits |= 1n << BigInt(i);
        i++;
        continue;
      }
      const d = driver.get(b);
      if (!d) {
        i++; // undriven: reads as 0
        continue;
      }
      // Extend the run while bits come from consecutive bits of the same variable.
      let len = 1;
      while (i + len < width) {
        const nb = bits[i + len];
        if (typeof nb !== 'number') break;
        const nd = driver.get(nb);
        if (!nd || nd.v !== d.v || nd.bit !== d.bit + len) break;
        len++;
      }
      deps?.add(d.v);
      const pos = i;
      const off = d.bit;
      let slice: string;
      if (d.v.big) {
        const s = off === 0 ? d.v.name : `(${d.v.name} >> ${off}n)`;
        const whole = off === 0 && len === d.v.width;
        slice = whole ? s : `BigInt.asUintN(${len}, ${s})`;
        if (!big) slice = `Number(${slice})`;
      } else {
        const whole = off === 0 && len === d.v.width;
        slice = whole ? d.v.name : off === 0 ? mN(d.v.name, len) : mN(`${d.v.name} >>> ${off}`, len);
        if (big) slice = `BigInt(${slice})`;
      }
      if (pos > 0) slice = big ? `(${slice} << ${pos}n)` : `(${slice} << ${pos})`;
      parts.push(slice);
      i += len;
    }
    if (constBits !== 0n) parts.push(big ? `${constBits}n` : String(Number(constBits)));
    if (parts.length === 0) return { code: zero(big), width, big };
    let code = parts.length === 1 ? parts[0] : `(${parts.join(' | ')})`;
    if (!big && parts.length > 1) code = `(${code} >>> 0)`;
    else if (!big && width === 32 && parts.length === 1 && code.includes('<<')) code = `(${code} >>> 0)`;
    return { code, width, big };
  };

  const srcOf = (cell: YosysCell) => parseSrcAttribute(cell.attributes?.src);

  /** Generate the right-hand side for a combinational cell, in the representation of `y`. */
  const genComb = (name: string, cell: YosysCell, y: Var, deps: Set<Var>): string => {
    const p = cell.parameters;
    const c = cell.connections;
    const A = c.A ? sig(c.A, deps) : undefined;
    const B = c.B ? sig(c.B, deps) : undefined;
    const aS = paramInt(p.A_SIGNED) !== 0;
    const bS = paramInt(p.B_SIGNED) !== 0;
    const yw = y.width;
    const fit = (code: string, big: boolean): string => {
      // Convert a domain result (already truncated to yw) to y's representation.
      if (big === y.big) return code;
      return big ? `Number(${code})` : `BigInt(${code})`;
    };
    const bool = (cond: string) => (y.big ? `((${cond}) ? 1n : 0n)` : `((${cond}) ? 1 : 0)`);
    const need = (e: Expr | undefined, port: string): Expr => {
      if (!e) {
        const src = srcOf(cell);
        throw new NetlistError(`Cell ${name} (${cell.type}) has no ${port} connection`, src?.file, src?.line);
      }
      return e;
    };

    switch (cell.type) {
      case '$not':
      case '$pos':
      case '$neg': {
        const a = need(A, 'A');
        const big = isBig(Math.max(a.width, yw));
        const ae = ext(a, yw, aS, big);
        if (cell.type === '$pos') return fit(big ? mB(ae, yw) : mN(ae, yw), big);
        if (cell.type === '$not') return fit(big ? mB(`~${ae}`, yw) : mN(`~(${ae})`, yw), big);
        return fit(big ? mB(`-${ae}`, yw) : mN(`-(${ae})`, yw), big);
      }
      case '$and':
      case '$or':
      case '$xor':
      case '$xnor': {
        const a = need(A, 'A');
        const b = need(B, 'B');
        const big = isBig(Math.max(a.width, b.width, yw));
        const ae = ext(a, yw, aS, big);
        const be = ext(b, yw, bS, big);
        const op = { $and: '&', $or: '|', $xor: '^', $xnor: '^' }[cell.type]!;
        let r = `(${ae}) ${op} (${be})`;
        if (cell.type === '$xnor') r = `~(${r})`;
        return fit(big ? mB(r, yw) : mN(r, yw), big);
      }
      case '$bwmux': {
        const a = need(A, 'A');
        const b = need(B, 'B');
        const s = need(c.S ? sig(c.S, deps) : undefined, 'S');
        const big = isBig(yw);
        const ae = ext(a, yw, false, big);
        const be = ext(b, yw, false, big);
        const se = ext(s, yw, false, big);
        const r = `((${ae}) & ~(${se})) | ((${be}) & (${se}))`;
        return fit(big ? mB(r, yw) : mN(r, yw), big);
      }
      case '$reduce_and': {
        const a = need(A, 'A');
        return bool(a.big ? `${a.code} === ${(1n << BigInt(a.width)) - 1n}n` : `${a.code} === ${maskNum(a.width)}`);
      }
      case '$reduce_or':
      case '$reduce_bool': {
        const a = need(A, 'A');
        return bool(`${a.code} !== ${zero(a.big)}`);
      }
      case '$reduce_xor':
      case '$reduce_xnor': {
        const a = need(A, 'A');
        const par = a.big ? `parB(${a.code})` : `par(${a.code})`;
        const r = cell.type === '$reduce_xor' ? par : `(${par} ^ 1)`;
        return y.big ? `BigInt(${r})` : r;
      }
      case '$logic_not': {
        const a = need(A, 'A');
        return bool(`${a.code} === ${zero(a.big)}`);
      }
      case '$logic_and':
      case '$logic_or': {
        const a = need(A, 'A');
        const b = need(B, 'B');
        const op = cell.type === '$logic_and' ? '&&' : '||';
        return bool(`(${a.code} !== ${zero(a.big)}) ${op} (${b.code} !== ${zero(b.big)})`);
      }
      case '$add':
      case '$sub':
      case '$mul': {
        const a = need(A, 'A');
        const b = need(B, 'B');
        const big = isBig(Math.max(a.width, b.width, yw));
        const ae = ext(a, yw, aS && bS, big);
        const be = ext(b, yw, aS && bS, big);
        let r: string;
        if (cell.type === '$mul') r = big ? `(${ae}) * (${be})` : `Math.imul(${ae}, ${be})`;
        else r = `(${ae}) ${cell.type === '$add' ? '+' : '-'} (${be})`;
        return fit(big ? mB(r, yw) : mN(r, yw), big);
      }
      case '$div':
      case '$mod':
      case '$divfloor':
      case '$modfloor': {
        const a = need(A, 'A');
        const b = need(B, 'B');
        const signed = aS && bS;
        const w = Math.max(a.width, b.width, yw);
        const big = isBig(w) || signed; // signed division is simplest with BigInt
        const av = signed ? `BigInt.asIntN(${w}, ${ext(a, w, true, true)})` : ext(a, w, false, big);
        const bv = signed ? `BigInt.asIntN(${w}, ${ext(b, w, true, true)})` : ext(b, w, false, big);
        let r: string;
        const isDiv = cell.type === '$div' || cell.type === '$divfloor';
        const floor = cell.type === '$divfloor' || cell.type === '$modfloor';
        if (big) {
          if (isDiv) r = floor ? `divfloorB(${av}, ${bv})` : `(${bv} === 0n ? -1n : ${av} / ${bv})`;
          else r = floor ? `modfloorB(${av}, ${bv})` : `(${bv} === 0n ? ${av} : ${av} % ${bv})`;
          return fit(mB(r, yw), true);
        }
        if (isDiv) r = `(${bv} === 0 ? 0xFFFFFFFF : Math.floor(${av} / ${bv}))`;
        else r = `(${bv} === 0 ? ${av} : ${av} % ${bv})`;
        return fit(mN(r, yw), false);
      }
      case '$eq':
      case '$ne':
      case '$eqx':
      case '$nex':
      case '$lt':
      case '$le':
      case '$gt':
      case '$ge': {
        const a = need(A, 'A');
        const b = need(B, 'B');
        const signed = aS && bS;
        const w = Math.max(a.width, b.width);
        const big = isBig(w);
        let av: string;
        let bv: string;
        if (signed) {
          av = big ? `BigInt.asIntN(${a.width}, ${toBig(a)})` : sval(a, false);
          bv = big ? `BigInt.asIntN(${b.width}, ${toBig(b)})` : sval(b, false);
        } else {
          av = big ? toBig(a) : toNum(a);
          bv = big ? toBig(b) : toNum(b);
        }
        const op = {
          $eq: '===',
          $eqx: '===',
          $ne: '!==',
          $nex: '!==',
          $lt: '<',
          $le: '<=',
          $gt: '>',
          $ge: '>=',
        }[cell.type]!;
        return bool(`(${av}) ${op} (${bv})`);
      }
      case '$shl':
      case '$sshl':
      case '$shr':
      case '$sshr':
      case '$shift':
      case '$shiftx': {
        const a = need(A, 'A');
        const b = need(B, 'B');
        const w = Math.max(a.width, yw);
        const big = isBig(w);
        const amount = b.big ? `Number(BigInt.asUintN(32, ${b.code}))` : b.code;
        const signedAmount = (cell.type === '$shift' || cell.type === '$shiftx') && bS;
        const amt = signedAmount ? sval({ ...b, code: amount, big: false, width: Math.min(b.width, 32) }, false) : amount;
        const ae = ext(a, w, aS, big);
        const left = cell.type === '$shl' || cell.type === '$sshl';
        const arith = cell.type === '$sshr' && aS;
        let r: string;
        if (big) {
          const sa = arith ? `BigInt.asIntN(${a.width}, ${toBig(a)})` : ae;
          if (left) r = `(s >= ${w} ? 0n : (${ae}) << BigInt(s))`;
          else if (arith) r = `(s >= ${w} ? (${sa} < 0n ? -1n : 0n) : (${sa}) >> BigInt(s))`;
          else if (signedAmount)
            r = `(s >= 0 ? (s >= ${w} ? 0n : (${ae}) >> BigInt(s)) : (-s >= ${w} ? 0n : (${ae}) << BigInt(-s)))`;
          else r = `(s >= ${w} ? 0n : (${ae}) >> BigInt(s))`;
          return fit(mB(`((s) => ${r})(${amt})`, yw), true);
        }
        if (left) r = `(s >= ${yw} ? 0 : (${ae}) << s)`;
        else if (arith) r = `(s >= 32 ? (${sval(a, false)} < 0 ? -1 : 0) : ${sval(a, false)} >> s)`;
        else if (signedAmount) r = `(s >= 0 ? (s >= 32 ? 0 : (${ae}) >>> s) : (-s >= 32 ? 0 : (${ae}) << -s))`;
        else r = `(s >= 32 ? 0 : (${ae}) >>> s)`;
        return fit(mN(`((s) => ${r})(${amt})`, yw), false);
      }
      case '$mux': {
        const a = need(A, 'A');
        const b = need(B, 'B');
        const s = need(c.S ? sig(c.S, deps) : undefined, 'S');
        const conv = (e: Expr) => (y.big ? toBig(e) : toNum(e));
        return `(${s.code} ? ${conv(b)} : ${conv(a)})`;
      }
      case '$tribuf': {
        const a = need(A, 'A');
        const en = need(c.EN ? sig(c.EN, deps) : undefined, 'EN');
        return `(${en.code} ? ${y.big ? toBig(a) : toNum(a)} : ${zero(y.big)})`;
      }
      case '$slice': {
        const a = need(A, 'A');
        const off = paramInt(p.OFFSET);
        const big = a.big;
        const r = big ? mB(`${a.code} >> ${off}n`, yw) : mN(`${a.code} >>> ${off}`, yw);
        return fit(r, big);
      }
      case '$concat': {
        const a = need(A, 'A');
        const b = need(B, 'B');
        const big = isBig(yw);
        const r = big
          ? mB(`${toBig(a)} | (${toBig(b)} << ${a.width}n)`, yw)
          : mN(`${toNum(a)} | (${toNum(b)} << ${a.width})`, yw);
        return fit(r, big);
      }
      default: {
        const src = srcOf(cell);
        throw new NetlistError(
          `The virtual board does not support the ${cell.type} cell (${name}). The design may still work in Quartus.`,
          src?.file,
          src?.line,
        );
      }
    }
  };

  // Topologically sort combinational cells.
  const varCell = new Map<Var, number>();
  combCells.forEach((cc, idx) => varCell.set(cc.y, idx));
  const code: string[] = [];
  const depsOf: Set<Var>[] = [];
  const exprs: string[] = [];
  combCells.forEach((cc) => {
    const deps = new Set<Var>();
    exprs.push(genComb(cc.name, cc.cell, cc.y, deps));
    depsOf.push(deps);
  });
  const indeg = combCells.map(() => 0);
  const users: number[][] = combCells.map(() => []);
  depsOf.forEach((deps, idx) => {
    for (const d of deps) {
      const src = varCell.get(d);
      if (src !== undefined) {
        indeg[idx]++;
        users[src].push(idx);
      }
    }
  });
  const queue: number[] = [];
  indeg.forEach((d, i) => d === 0 && queue.push(i));
  const order: number[] = [];
  while (queue.length) {
    const i = queue.shift()!;
    order.push(i);
    for (const u of users[i]) if (--indeg[u] === 0) queue.push(u);
  }
  if (order.length !== combCells.length) {
    const stuck = combCells.filter((_, i) => indeg[i] > 0);
    const src = srcOf(stuck[0].cell);
    throw new NetlistError(
      `Combinational loop detected (involving ${stuck
        .slice(0, 3)
        .map((s) => s.name)
        .join(', ')}). The virtual board cannot run designs with combinational feedback.`,
      src?.file,
      src?.line,
    );
  }
  for (const i of order) code.push(`${combCells[i].y.name} = ${exprs[i]};`);

  // Initial values come from the "init" attribute on the nets a register drives.
  const initOf = new Map<number, '0' | '1'>();
  for (const net of Object.values(mod.netnames)) {
    const init = net.attributes?.init;
    if (typeof init !== 'string') continue;
    const bitsStr = init.length >= net.bits.length ? init.slice(init.length - net.bits.length) : init.padStart(net.bits.length, '0');
    net.bits.forEach((b, i) => {
      if (typeof b !== 'number') return;
      const ch = bitsStr[bitsStr.length - 1 - i];
      if (ch === '1' || ch === '0') initOf.set(b, ch);
    });
  }

  // Sequential logic.
  const edgeLines: string[] = [];
  const commitLines: string[] = [];
  const levelLines: string[] = [];
  const primeLines: string[] = [];
  const resetLines: string[] = [];
  const stateDecls: string[] = [];
  const constFor = (v: Var, value: bigint) => (v.big ? `${value}n` : String(Number(value)));
  const sigOf = (cell: YosysCell, port: string): Expr => {
    const bits = cell.connections[port];
    if (!bits) throw new NetlistError(`Cell ${cell.type} has no ${port} connection`);
    return sig(bits);
  };
  const asRep = (e: Expr, v: Var) => (v.big ? toBig(e) : toNum(e));
  const polarity = (cell: YosysCell, param: string) => paramInt(cell.parameters[param], 1) !== 0;
  const activeIf = (e: Expr, pol: boolean) => (pol ? `(${e.code} !== ${zero(e.big)})` : `(${e.code} === ${zero(e.big)})`);
  const allOnes = (v: Var) => (v.big ? `${(1n << BigInt(v.width)) - 1n}n` : maskNum(v.width));

  stateCells.forEach((sc, k) => {
    const { cell, q } = sc;
    let initVal = 0n;
    cell.connections.Q.forEach((b, i) => {
      if (typeof b === 'number' && initOf.get(b) === '1') initVal |= 1n << BigInt(i);
    });
    resetLines.push(`${q.name} = ${constFor(q, initVal)};`);

    switch (cell.type) {
      case '$dff':
      case '$adff':
      case '$aldff':
      case '$dffsr': {
        const clk = sigOf(cell, 'CLK');
        const pos = polarity(cell, 'CLK_POLARITY');
        const d = sigOf(cell, 'D');
        stateDecls.push(`let pc${k} = 0, nd${k} = ${zero(q.big)}, t${k} = false;`);
        primeLines.push(`pc${k} = ${clk.code} ? 1 : 0;`);
        edgeLines.push(
          `{ const c = ${clk.code} ? 1 : 0; if (c !== pc${k}) { pc${k} = c; if (c === ${pos ? 1 : 0}) { nd${k} = ${asRep(d, q)}; t${k} = true; } } }`,
        );
        commitLines.push(`if (t${k}) { t${k} = false; if (${q.name} !== nd${k}) { ${q.name} = nd${k}; changed = true; } }`);
        if (cell.type === '$adff') {
          const arst = sigOf(cell, 'ARST');
          const val = paramInt(cell.parameters.ARST_VALUE);
          const rv = constFor(q, BigInt(val) & ((1n << BigInt(q.width)) - 1n));
          const rvBig = typeof cell.parameters.ARST_VALUE === 'string' && /^[01xz]+$/.test(cell.parameters.ARST_VALUE)
            ? (q.big ? `${BigInt('0b' + cell.parameters.ARST_VALUE.replace(/[xz]/g, '0'))}n` : rv)
            : rv;
          levelLines.push(
            `if (${activeIf(arst, polarity(cell, 'ARST_POLARITY'))} && ${q.name} !== ${rvBig}) { ${q.name} = ${rvBig}; changed = true; }`,
          );
        } else if (cell.type === '$aldff') {
          const aload = sigOf(cell, 'ALOAD');
          const ad = sigOf(cell, 'AD');
          levelLines.push(
            `if (${activeIf(aload, polarity(cell, 'ALOAD_POLARITY'))}) { const v = ${asRep(ad, q)}; if (${q.name} !== v) { ${q.name} = v; changed = true; } }`,
          );
        } else if (cell.type === '$dffsr') {
          levelLines.push(dffsrLevel(cell, q, sig, polarity));
        }
        break;
      }
      case '$dlatch':
      case '$adlatch': {
        const en = sigOf(cell, 'EN');
        const d = sigOf(cell, 'D');
        if (cell.type === '$adlatch') {
          const arst = sigOf(cell, 'ARST');
          const rv = constFor(q, BigInt(paramInt(cell.parameters.ARST_VALUE)));
          levelLines.push(
            `if (${activeIf(arst, polarity(cell, 'ARST_POLARITY'))}) { if (${q.name} !== ${rv}) { ${q.name} = ${rv}; changed = true; } } else if (${activeIf(en, polarity(cell, 'EN_POLARITY'))}) { const v = ${asRep(d, q)}; if (${q.name} !== v) { ${q.name} = v; changed = true; } }`,
          );
        } else {
          levelLines.push(
            `if (${activeIf(en, polarity(cell, 'EN_POLARITY'))}) { const v = ${asRep(d, q)}; if (${q.name} !== v) { ${q.name} = v; changed = true; } }`,
          );
        }
        break;
      }
      case '$sr': {
        levelLines.push(dffsrLevel(cell, q, sig, polarity));
        break;
      }
      default: {
        const src = srcOf(cell);
        throw new NetlistError(
          `The virtual board does not support the ${cell.type} cell (${sc.name}).`,
          src?.file,
          src?.line,
        );
      }
    }
  });
  void allOnes;

  const outputExprs = outputs.map((o) => ({ name: o.name, e: sig(mod.ports[o.name].bits) }));

  // Nets that can be inspected or bypassed.
  const nets: SimNetInfo[] = [];
  const netExprs: Record<string, string> = {};
  for (const [name, net] of Object.entries(mod.netnames)) {
    if (net.hide_name) continue;
    const e = sig(net.bits);
    netExprs[name] = e.code;
    const registered = net.bits.some((b) => typeof b === 'number' && registeredBits.has(b));
    nets.push({ name, width: net.bits.length, registered });
  }
  nets.sort((a, b) => a.name.localeCompare(b.name));

  const allVars = vars.map((v) => `let ${v.name} = ${zero(v.big)};`).join('\n');
  const inputSetters = [...inputVars.entries()]
    .map(([n, v]) => `case ${JSON.stringify(n)}: ${v.name} = ${v.big ? `BigInt.asUintN(${v.width}, BigInt(value))` : `Number(BigInt.asUintN(${v.width}, BigInt(value)))`}; return;`)
    .join('\n');
  const inputGetters = [...inputVars.entries()].map(([n, v]) => `case ${JSON.stringify(n)}: return ${v.name};`).join('\n');
  const clockOverrides = overrideVars
    .filter((x) => x.o.mode === 'clock')
    .map((x) => `${x.v.name} = ${x.v.big ? 'BigInt(value)' : 'value'};`)
    .join('\n');
  const constOverrides = overrideVars
    .filter((x) => x.o.mode !== 'clock')
    .map((x) => `${x.v.name} = ${x.o.mode === 'high' ? allOnes(x.v) : zero(x.v.big)};`)
    .join('\n');

  const body = `
"use strict";
${allVars}
${stateDecls.join('\n')}
function par(v) { v ^= v >>> 16; v ^= v >>> 8; v ^= v >>> 4; v ^= v >>> 2; v ^= v >>> 1; return v & 1; }
function parB(v) { let p = 0; while (v) { p ^= Number(v & 1n); v >>= 1n; } return p; }
function divfloorB(a, b) { if (b === 0n) return -1n; const q = a / b; return (a % b !== 0n && ((a < 0n) !== (b < 0n))) ? q - 1n : q; }
function modfloorB(a, b) { if (b === 0n) return a; const r = a % b; return (r !== 0n && ((r < 0n) !== (b < 0n))) ? r + b : r; }
function comb() {
${code.join('\n')}
}
function settle() {
  for (let iter = 0; iter < 10000; iter++) {
    comb();
    let changed = false;
${edgeLines.join('\n')}
${commitLines.join('\n')}
${levelLines.join('\n')}
    if (!changed) return;
  }
  throw new Error('Design did not settle (oscillating latch or clock loop)');
}
function reset() {
${resetLines.join('\n')}
${constOverrides}
  comb();
${primeLines.join('\n')}
  settle();
}
return {
  setInput(name, value) { switch (name) { ${inputSetters} } throw new Error('Unknown input ' + name); },
  getInput(name) { switch (name) { ${inputGetters} } throw new Error('Unknown input ' + name); },
  setOverrideClock(value) { ${clockOverrides} },
  settle,
  reset,
  outputs() { return { ${outputExprs.map((o) => `${JSON.stringify(o.name)}: ${o.e.code}`).join(', ')} }; },
  outputsInto(a) { ${outputExprs.map((o, i) => `a[${i}] = ${o.e.code};`).join(' ')} },
  net(name) { switch (name) { ${Object.entries(netExprs)
    .map(([n, e]) => `case ${JSON.stringify(n)}: return ${e};`)
    .join(' ')} } throw new Error('Unknown net ' + name); },
};
`;
  let rt: {
    setInput(n: string, v: SimValue): void;
    getInput(n: string): SimValue;
    setOverrideClock(v: number): void;
    settle(): void;
    reset(): void;
    outputs(): Record<string, SimValue>;
    outputsInto(a: SimValue[]): void;
    net(n: string): SimValue;
  };
  try {
    rt = new Function(body)();
  } catch (e) {
    throw new NetlistError(`Internal error compiling the netlist: ${(e as Error).message}`);
  }
  rt.reset();

  return {
    top,
    inputs,
    outputs,
    nets,
    overrides,
    ignoredCells: [...ignoredCells],
    setInput: (n, v) => rt.setInput(n, v),
    getInput: (n) => rt.getInput(n),
    setOverrideClock: (v) => rt.setOverrideClock(v),
    settle: () => rt.settle(),
    getOutput: (n) => rt.outputs()[n],
    getOutputs: () => rt.outputs(),
    readOutputs: (a) => rt.outputsInto(a),
    getNet: (n) => rt.net(n),
    reset: () => rt.reset(),
  };
}

function dffsrLevel(
  cell: YosysCell,
  q: Var,
  sig: (bits: YosysBit[]) => Expr,
  polarity: (cell: YosysCell, p: string) => boolean,
): string {
  const set = sig(cell.connections.SET);
  const clr = sig(cell.connections.CLR);
  const sp = polarity(cell, 'SET_POLARITY');
  const cp = polarity(cell, 'CLR_POLARITY');
  const conv = (e: Expr) => (q.big ? toBig(e) : toNum(e));
  const mask = q.big ? `${(1n << BigInt(q.width)) - 1n}n` : maskNum(q.width);
  const sAct = sp ? conv(set) : `(~${conv(set)} & ${mask})`;
  const cAct = cp ? conv(clr) : `(~${conv(clr)} & ${mask})`;
  const r = q.big ? `((${q.name} | ${sAct}) & ~${cAct}) & ${mask}` : `(((${q.name} | ${sAct}) & ~${cAct}) & ${mask}) >>> 0`;
  return `{ const v = ${r}; if (v !== ${q.name}) { ${q.name} = v; changed = true; } }`;
}
