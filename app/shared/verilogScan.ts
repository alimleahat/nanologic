// A small, forgiving Verilog scanner used for things that must work even when
// the code does not compile: finding modules, ports, instances and testbenches,
// building the hierarchy view and the lint checks. Real checking is done by the
// toolchain (Icarus Verilog and Yosys).

export interface ScannedPort {
  name: string;
  direction: 'input' | 'output' | 'inout' | 'unknown';
  /** Declared range, e.g. "[7:0]", or "" for a scalar. */
  range: string;
  /** Width if the range is made of integer literals, otherwise undefined. */
  width?: number;
  msb?: number;
  lsb?: number;
}

export interface ScannedInstance {
  moduleName: string;
  instanceName: string;
  line: number;
}

export interface ScannedModule {
  name: string;
  line: number;
  endLine: number;
  ports: ScannedPort[];
  instances: ScannedInstance[];
  hasInitial: boolean;
}

export interface Token {
  text: string;
  /** Offset into the source. */
  pos: number;
  line: number;
  kind: 'id' | 'num' | 'sys' | 'punct' | 'directive';
}

const KEYWORDS = new Set(
  `always and assign automatic begin buf bufif0 bufif1 case casex casez cell cmos config deassign default defparam design disable edge else end endcase endconfig endfunction endgenerate endmodule endprimitive endspecify endtable endtask event for force forever fork function generate genvar highz0 highz1 if ifnone incdir include initial inout input instance integer join large liblist library localparam macromodule medium module nand negedge nmos nor noshowcancelled not notif0 notif1 or output parameter pmos posedge primitive pull0 pull1 pulldown pullup pulsestyle_onevent pulsestyle_ondetect rcmos real realtime reg release repeat rnmos rpmos rtran rtranif0 rtranif1 scalared showcancelled signed small specify specparam strong0 strong1 supply0 supply1 table task time tran tranif0 tranif1 tri tri0 tri1 triand trior trireg unsigned use uwire vectored wait wand weak0 weak1 while wire wor xnor xor logic bit byte int shortint longint always_ff always_comb always_latch`.split(
    /\s+/,
  ),
);

export function isKeyword(s: string): boolean {
  return KEYWORDS.has(s);
}

/** Replace comments and string contents with spaces, keeping offsets and newlines. */
export function blankCommentsAndStrings(src: string): string {
  const out = src.split('');
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') out[i++] = ' ';
    } else if (c === '/' && d === '*') {
      out[i++] = ' ';
      out[i++] = ' ';
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') out[i] = ' ';
        i++;
      }
      if (i < n) {
        out[i++] = ' ';
        out[i++] = ' ';
      }
    } else if (c === '"') {
      i++;
      while (i < n && src[i] !== '"' && src[i] !== '\n') {
        if (src[i] === '\\') out[i++] = ' ';
        if (i < n && src[i] !== '\n') out[i++] = ' ';
      }
      i++;
    } else {
      i++;
    }
  }
  return out.join('');
}

export function tokenize(src: string): Token[] {
  const s = blankCommentsAndStrings(src);
  const tokens: Token[] = [];
  let line = 1;
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }
    const start = i;
    if (/[A-Za-z_]/.test(c)) {
      while (i < n && /[A-Za-z0-9_$]/.test(s[i])) i++;
      tokens.push({ text: s.slice(start, i), pos: start, line, kind: 'id' });
    } else if (c === '\\') {
      // escaped identifier
      while (i < n && !/\s/.test(s[i])) i++;
      tokens.push({ text: s.slice(start, i), pos: start, line, kind: 'id' });
    } else if (c === '$') {
      i++;
      while (i < n && /[A-Za-z0-9_$]/.test(s[i])) i++;
      tokens.push({ text: s.slice(start, i), pos: start, line, kind: 'sys' });
    } else if (c === '`') {
      i++;
      while (i < n && /[A-Za-z0-9_]/.test(s[i])) i++;
      tokens.push({ text: s.slice(start, i), pos: start, line, kind: 'directive' });
    } else if (/[0-9']/.test(c)) {
      // numbers including sized literals like 4'b1010, 8'hFF, 'd3
      while (i < n && /[0-9_.]/.test(s[i])) i++;
      if (s[i] === "'" || c === "'") {
        if (s[i] === "'") i++;
        if (/[sS]/.test(s[i])) i++;
        if (/[bBoOdDhH]/.test(s[i])) i++;
        while (i < n && /[ \t]/.test(s[i])) i++;
        while (i < n && /[0-9a-fA-F_xXzZ?]/.test(s[i])) i++;
      }
      tokens.push({ text: s.slice(start, i), pos: start, line, kind: 'num' });
    } else {
      const two = s.slice(i, i + 3);
      const ops = ['<<<', '>>>', '===', '!==', '<=', '>=', '==', '!=', '&&', '||', '<<', '>>', '**', '~&', '~|', '~^', '^~', '+:', '-:'];
      const op = ops.find((o) => two.startsWith(o));
      i += op ? op.length : 1;
      tokens.push({ text: s.slice(start, i), pos: start, line, kind: 'punct' });
    }
  }
  return tokens;
}

function parseRange(tokens: Token[], i: number): { range: string; msb?: number; lsb?: number; next: number } {
  if (tokens[i]?.text !== '[') return { range: '', next: i };
  let depth = 0;
  let j = i;
  const parts: string[] = [];
  for (; j < tokens.length; j++) {
    const t = tokens[j].text;
    parts.push(t);
    if (t === '[') depth++;
    else if (t === ']' && --depth === 0) break;
  }
  const range = parts.join('');
  const m = /^\[(-?\d+):(-?\d+)\]$/.exec(range);
  return m ? { range, msb: Number(m[1]), lsb: Number(m[2]), next: j + 1 } : { range, next: j + 1 };
}

function skipBalanced(tokens: Token[], i: number, open: string, close: string): number {
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    if (tokens[j].text === open) depth++;
    else if (tokens[j].text === close && --depth === 0) return j + 1;
  }
  return tokens.length;
}

const DIRS = new Set(['input', 'output', 'inout']);
const NET_TYPES = new Set(['wire', 'reg', 'logic', 'tri', 'integer', 'signed', 'unsigned', 'supply0', 'supply1', 'wand', 'wor', 'uwire']);

function makePort(name: string, dir: ScannedPort['direction'], r: { range: string; msb?: number; lsb?: number }): ScannedPort {
  const p: ScannedPort = { name, direction: dir, range: r.range };
  if (r.range === '') p.width = 1;
  else if (r.msb !== undefined && r.lsb !== undefined) {
    p.msb = r.msb;
    p.lsb = r.lsb;
    p.width = Math.abs(r.msb - r.lsb) + 1;
  }
  return p;
}

/** Parse a run of declarations "input wire [3:0] a, b" starting at a direction keyword. */
function parseDecl(tokens: Token[], i: number, stop: Set<string>): { ports: ScannedPort[]; next: number } {
  const dir = tokens[i].text as ScannedPort['direction'];
  i++;
  while (i < tokens.length && NET_TYPES.has(tokens[i].text)) i++;
  const r = parseRange(tokens, i);
  i = r.next;
  const ports: ScannedPort[] = [];
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === 'id' && !isKeyword(t.text)) {
      ports.push(makePort(t.text, dir, r));
      i++;
      // skip unpacked dims / default values
      while (i < tokens.length && tokens[i].text === '[') i = parseRange(tokens, i).next;
      if (tokens[i]?.text === '=') {
        while (i < tokens.length && tokens[i].text !== ',' && !stop.has(tokens[i].text)) i++;
      }
      if (tokens[i]?.text === ',') {
        // A following direction keyword starts a new declaration.
        if (DIRS.has(tokens[i + 1]?.text)) return { ports, next: i + 1 };
        i++;
        continue;
      }
      return { ports, next: i };
    }
    return { ports, next: i };
  }
  return { ports, next: i };
}

export function scanModules(src: string): ScannedModule[] {
  const tokens = tokenize(src);
  const modules: ScannedModule[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.text !== 'module' && t.text !== 'macromodule') {
      i++;
      continue;
    }
    const nameTok = tokens[i + 1];
    if (!nameTok || nameTok.kind !== 'id') {
      i++;
      continue;
    }
    const mod: ScannedModule = { name: nameTok.text, line: t.line, endLine: t.line, ports: [], instances: [], hasInitial: false };
    i += 2;
    if (tokens[i]?.text === '#') i = skipBalanced(tokens, i + 1, '(', ')');
    const headerNames: string[] = [];
    if (tokens[i]?.text === '(') {
      const end = skipBalanced(tokens, i, '(', ')') - 1;
      let j = i + 1;
      while (j < end) {
        const tk = tokens[j];
        if (DIRS.has(tk.text)) {
          const d = parseDecl(tokens, j, new Set([')']));
          mod.ports.push(...d.ports);
          j = Math.max(d.next, j + 1);
        } else if (tk.kind === 'id' && !isKeyword(tk.text)) {
          headerNames.push(tk.text);
          j++;
        } else j++;
      }
      i = end + 1;
    }
    // Module body.
    let depthBegin = 0;
    while (i < tokens.length && tokens[i].text !== 'endmodule') {
      const tk = tokens[i];
      if (DIRS.has(tk.text) && depthBegin === 0) {
        const d = parseDecl(tokens, i, new Set([';']));
        for (const p of d.ports) {
          const existing = mod.ports.find((x) => x.name === p.name);
          if (existing) Object.assign(existing, p);
          else if (headerNames.includes(p.name)) mod.ports.push(p);
        }
        i = Math.max(d.next, i + 1);
        continue;
      }
      if (tk.text === 'initial') mod.hasInitial = true;
      if (tk.text === 'begin' || tk.text === 'case' || tk.text === 'fork') depthBegin++;
      if (tk.text === 'end' || tk.text === 'endcase' || tk.text === 'join') depthBegin = Math.max(0, depthBegin - 1);
      if (tk.text === 'function' || tk.text === 'task') {
        const endKw = tk.text === 'function' ? 'endfunction' : 'endtask';
        while (i < tokens.length && tokens[i].text !== endKw) i++;
        i++;
        continue;
      }
      // Instance: <id> [#(...)] <id> [range] ( ... ) ;  at statement start
      const prev = tokens[i - 1]?.text;
      if (
        tk.kind === 'id' &&
        !isKeyword(tk.text) &&
        (prev === ';' || prev === ')' || prev === 'end' || prev === 'begin' || prev === 'endgenerate' || prev === 'generate' || prev === 'else' || i === 0 || prev === 'endcase' || prev === ':')
      ) {
        let j = i + 1;
        if (tokens[j]?.text === '#') {
          j++;
          if (tokens[j]?.text === '(') j = skipBalanced(tokens, j, '(', ')');
          else j++;
        }
        const inst = tokens[j];
        if (inst && inst.kind === 'id' && !isKeyword(inst.text)) {
          let k = j + 1;
          if (tokens[k]?.text === '[') k = parseRange(tokens, k).next;
          if (tokens[k]?.text === '(') {
            mod.instances.push({ moduleName: tk.text, instanceName: inst.text, line: tk.line });
            i = skipBalanced(tokens, k, '(', ')');
            continue;
          }
        }
      }
      i++;
    }
    for (const name of headerNames) {
      if (!mod.ports.some((p) => p.name === name)) mod.ports.push({ name, direction: 'unknown', range: '' });
    }
    // Keep header order for non-ANSI ports.
    if (headerNames.length) mod.ports.sort((a, b) => headerNames.indexOf(a.name) - headerNames.indexOf(b.name));
    mod.endLine = tokens[i]?.line ?? mod.line;
    modules.push(mod);
    i++;
  }
  return modules;
}

/** A testbench is a module with no ports that has an initial block. */
export function isTestbenchModule(m: ScannedModule): boolean {
  return m.ports.length === 0 && m.hasInitial;
}

export function isTestbenchFile(fileName: string, modules: ScannedModule[]): boolean {
  if (/_tb\.s?v$/i.test(fileName) || /^tb_.*\.s?v$/i.test(fileName.split(/[\\/]/).pop() ?? '')) return true;
  return modules.length > 0 && modules.some(isTestbenchModule);
}

/** Modules that are not instantiated by any other module in the set. */
export function findTopCandidates(modules: ScannedModule[]): string[] {
  const names = new Set(modules.map((m) => m.name));
  const used = new Set<string>();
  for (const m of modules) for (const inst of m.instances) if (inst.moduleName !== m.name) used.add(inst.moduleName);
  return modules.filter((m) => !used.has(m.name) && names.has(m.name)).map((m) => m.name);
}

export interface HierarchyNode {
  module: string;
  instance?: string;
  file?: string;
  line?: number;
  missing?: boolean;
  children: HierarchyNode[];
}

export function buildHierarchy(
  top: string,
  modules: { module: ScannedModule; file: string }[],
  depthLimit = 32,
): HierarchyNode {
  const byName = new Map(modules.map((m) => [m.module.name, m]));
  const walk = (name: string, instance: string | undefined, depth: number, seen: Set<string>): HierarchyNode => {
    const entry = byName.get(name);
    const node: HierarchyNode = { module: name, instance, file: entry?.file, line: entry?.module.line, missing: !entry, children: [] };
    if (!entry || depth > depthLimit || seen.has(name)) return node;
    const next = new Set(seen).add(name);
    node.children = entry.module.instances.map((i) => walk(i.moduleName, i.instanceName, depth + 1, next));
    return node;
  };
  return walk(top, undefined, 0, new Set());
}
