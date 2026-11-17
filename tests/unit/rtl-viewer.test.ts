// The RTL Viewer's netlist (built with the bundled Yosys) and its layout.
import fs from 'node:fs';
import path from 'node:path';
import ELK from 'elkjs/lib/elk.bundled.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseProject } from '../../app/shared/project';
import { layoutModule } from '../../app/shared/rtl/layout';
import { displayModuleName, resolveInstancePath, type RtlModuleView, type RtlNetlist, type RtlNode } from '../../app/shared/rtl/netlist';
import { buildHierarchy, scanModules } from '../../app/shared/verilogScan';
import { buildRtlView } from '../../app/main/toolchain/rtlNetlist';

const ROOT = path.resolve(__dirname, '../..');
const STARTER = path.join(ROOT, 'examples/starter-de10lite');
const TRAFFIC = path.join(ROOT, 'tests/fixtures/fpga-traffic-light-controller');
const starterProject = () => parseProject(fs.readFileSync(path.join(STARTER, 'starter.nlproj'), 'utf8'));
const trafficProject = () => parseProject(fs.readFileSync(path.join(ROOT, 'examples/traffic-light/traffic_light.nlproj'), 'utf8'));

/** "name:direction:width" for each port of a module view, in declaration order. */
function ports(view: RtlModuleView): string[] {
  return view.nodes
    .filter((n) => n.shape === 'input' || n.shape === 'output')
    .map((n) => `${n.name}:${n.shape === 'input' ? 'in' : 'out'}:${n.pins[0].bits.length}`);
}

/** instance -> module for the instances in a view. */
function instances(view: RtlModuleView): Record<string, string> {
  return Object.fromEntries(view.nodes.filter((n) => n.shape === 'module').map((n) => [n.name, n.module!]));
}

function pinsOf(node: RtlNode): string[] {
  return node.pins.map((p) => `${p.name}:${p.dir}:${p.bits.length}`);
}

/** Wires between two named pins ("inst.pin" or a port name). */
function connects(view: RtlModuleView, from: string, to: string): boolean {
  const ref = (s: string) => {
    const [n, p] = s.includes('.') ? s.split('.') : [s, s];
    const node = view.nodes.find((x) => x.name === n && (s.includes('.') ? x.shape === 'module' : x.shape === 'input' || x.shape === 'output'));
    return { id: node?.id, pin: p };
  };
  const a = ref(from);
  const b = ref(to);
  return view.edges.some((e) => e.source === a.id && e.sourcePin === a.pin && e.target === b.id && e.targetPin === b.pin);
}

/** Every wire ends on existing pins, and the instance pins match the module they instantiate. */
function checkConsistent(net: RtlNetlist) {
  for (const view of Object.values(net.modules)) {
    const byId = new Map(view.nodes.map((n) => [n.id, n]));
    for (const e of view.edges) {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      expect(s?.pins.some((p) => p.name === e.sourcePin && p.dir === 'out'), `${view.name} ${e.id} source`).toBe(true);
      expect(t?.pins.some((p) => p.name === e.targetPin && p.dir === 'in'), `${view.name} ${e.id} target`).toBe(true);
      expect(e.bits.length).toBeGreaterThan(0);
    }
    for (const inst of view.nodes.filter((n) => n.shape === 'module')) {
      const def = net.modules[inst.module!];
      expect(def, inst.module).toBeDefined();
      expect(pinsOf(inst)).toEqual(ports(def));
    }
  }
}

describe('RTL Viewer netlist: starter example', () => {
  let net: RtlNetlist;
  beforeAll(async () => {
    const r = await buildRtlView(STARTER, starterProject(), 'rtl');
    expect(r.messages).toEqual([]);
    expect(r.ok).toBe(true);
    net = r.netlist!;
  });

  it('has the expected modules, ports and instance', () => {
    expect(net.top).toBe('top');
    expect(Object.keys(net.modules).sort()).toEqual(['hex_to_7seg', 'top']);
    const top = net.modules.top;
    expect(ports(top)).toEqual([
      'MAX10_CLK1_50:in:1',
      'KEY:in:2',
      'SW:in:10',
      'LEDR:out:10',
      'HEX0:out:8',
      'HEX1:out:8',
      'HEX2:out:8',
      'HEX3:out:8',
      'HEX4:out:8',
      'HEX5:out:8',
    ]);
    expect(instances(top)).toEqual({ digit0: 'hex_to_7seg' });
    expect(pinsOf(top.nodes.find((n) => n.name === 'digit0')!)).toEqual(['digit:in:4', 'seg:out:7']);
    expect(ports(net.modules.hex_to_7seg)).toEqual(['digit:in:4', 'seg:out:7']);
    checkConsistent(net);
  });

  it('shows the logic: registers, adders, comparator and multiplexers, with names and source lines', () => {
    const top = net.modules.top;
    const regs = top.nodes.filter((n) => n.shape === 'register');
    expect(regs.map((r) => r.name).sort()).toEqual(['count', 'div_count']);
    const count = regs.find((r) => r.name === 'count')!;
    expect(count.src).toEqual({ file: 'top.v', line: 40 });
    expect(count.pins.find((p) => p.name === 'CLK')?.clock).toBe(true);
    expect(count.pins.find((p) => p.name === 'ARST')?.negated).toBe(true); // reset on KEY[0] low
    expect(top.nodes.filter((n) => n.shape === 'op').map((n) => n.detail).sort()).toEqual(['+', '+', '=']);
    expect(top.nodes.filter((n) => n.shape === 'mux').length).toBeGreaterThanOrEqual(2);
    // LEDR = SW is a straight wire; HEX1-5 are tied off with constants.
    expect(connects(top, 'SW', 'LEDR')).toBe(true);
    expect(top.nodes.filter((n) => n.shape === 'const').map((n) => n.name)).toContain("8'b11111111");
    expect(top.edges.some((e) => e.name === 'count' && e.showLabel)).toBe(true);
    // The case statement in hex_to_7seg is one multiplexer with a case input per digit.
    const mux = net.modules.hex_to_7seg.nodes.find((n) => n.type === '$pmux')!;
    expect(mux.pins.filter((p) => p.name.startsWith('B#'))).toHaveLength(16); // 0-F; "default" is the A input
  });
});

describe('RTL Viewer netlist: traffic light reference project', () => {
  let rtl: RtlNetlist;
  let gates: RtlNetlist;
  beforeAll(async () => {
    const [a, b] = [await buildRtlView(TRAFFIC, trafficProject(), 'rtl'), await buildRtlView(TRAFFIC, trafficProject(), 'gates')];
    expect(a.ok && b.ok).toBe(true);
    rtl = a.netlist!;
    gates = b.netlist!;
  });

  it('has all 14 modules with their ports', () => {
    expect(rtl.top).toBe('MainCode');
    expect(Object.keys(rtl.modules).sort()).toEqual(
      [
        'BCD7Seg',
        'BinaryBCD',
        'ClockDivider',
        'Comparator4',
        'CoreLogic',
        'CounterUnit',
        'Decoder',
        'FourBitFullAdder',
        'MainCode',
        'Mux',
        'Mux2Way4',
        'OneBitFullAdder',
        'SevenSegDisplay',
        'Subtractor',
      ].sort(),
    );
    expect(ports(rtl.modules.MainCode)).toEqual([
      'CLK_50MHz:in:1',
      'rst_n:in:1',
      'pedestrian_btn:in:1',
      'HexH:out:7',
      'HexL:out:7',
      'Green:out:1',
      'Red:out:1',
      'Amber:out:1',
      'LEDR9:out:1',
    ]);
    expect(ports(rtl.modules.CoreLogic)).toEqual(['CLK:in:1', 'rst_n:in:1', 'pedestrian_btn:in:1', 'ControlSignal:out:6', 'LEDR9:out:1', 'extend:out:1']);
    expect(ports(rtl.modules.ClockDivider)).toEqual(['CLK_50MHz:in:1', 'rst_n:in:1', 'CLK_1Hz:out:1']);
    expect(ports(rtl.modules.Decoder)).toEqual(['ControlSignal:in:6', 'extend:in:1', 'Count:out:4', 'Green:out:1', 'Red:out:1', 'Amber:out:1']);
    expect(ports(rtl.modules.CounterUnit)).toEqual(['CLK:in:1', 'Setting:in:4', 'rst_n:in:1', 'Count:out:4']);
    checkConsistent(rtl);
    checkConsistent(gates);
  });

  it('wires the top level like MainCode.v', () => {
    const top = rtl.modules.MainCode;
    expect(instances(top)).toEqual({ clkdiv: 'ClockDivider', core: 'CoreLogic', dec: 'Decoder', seven_seg: 'SevenSegDisplay' });
    expect(top.logicCount).toBe(0);
    expect(connects(top, 'CLK_50MHz', 'clkdiv.CLK_50MHz')).toBe(true);
    expect(connects(top, 'clkdiv.CLK_1Hz', 'core.CLK')).toBe(true);
    expect(connects(top, 'core.ControlSignal', 'dec.ControlSignal')).toBe(true);
    expect(connects(top, 'core.extend', 'dec.extend')).toBe(true);
    expect(connects(top, 'dec.Count', 'seven_seg.Count')).toBe(true);
    expect(connects(top, 'seven_seg.SevenSegH', 'HexH')).toBe(true);
    expect(connects(top, 'dec.Green', 'Green')).toBe(true);
    expect(connects(top, 'core.LEDR9', 'LEDR9')).toBe(true);
    expect(top.edges.find((e) => e.name === 'CLK_1Hz')?.src).toEqual({ file: 'rtl/MainCode.v', line: 19 });
  });

  it('shows the inside of CoreLogic: registers, adder, multiplexers, gates and sub-modules', () => {
    const core = rtl.modules.CoreLogic;
    expect(instances(core)).toEqual({ Counter1: 'CounterUnit', match_check: 'Comparator4', ped_mux: 'Mux2Way4', setting_mux: 'Mux2Way4' });
    const regs = core.nodes.filter((n) => n.shape === 'register');
    expect(regs.map((r) => `${r.name}:${r.pins.find((p) => p.name === 'Q')!.bits.length}`).sort()).toEqual(['ped:1', 'phase:2']);
    expect(regs.every((r) => r.src?.file === 'rtl/CoreLogic.v' && r.src.line === 50)).toBe(true);
    expect(core.nodes.filter((n) => n.shape === 'op').map((n) => n.type)).toEqual(['$add']);
    expect(core.nodes.filter((n) => n.shape === 'mux')).toHaveLength(3);
    expect(core.nodes.filter((n) => n.shape === 'not' || n.shape === 'or' || n.shape === 'and').length).toBeGreaterThanOrEqual(4);
    expect(core.edges.filter((e) => e.showLabel).map((e) => e.name)).toEqual(expect.arrayContaining(['phase_red', 'count_match', 'Setting', 'red_setting']));
  });

  it('breaks everything down to AND, OR, NOT, XOR and flip-flops in the gate view', () => {
    const allowed = new Set(['$_AND_', '$_OR_', '$_XOR_', '$_NOT_']);
    for (const view of Object.values(gates.modules)) {
      for (const n of view.nodes) {
        if (['input', 'output', 'const', 'module'].includes(n.shape)) continue;
        const ok = allowed.has(n.type) || /^\$_(DFF|DLATCH)_[PN01]+_$/.test(n.type);
        expect(ok, `${view.name}: ${n.type}`).toBe(true);
      }
    }
    // Same modules and instances as the RTL view.
    expect(Object.keys(gates.modules).sort()).toEqual(Object.keys(rtl.modules).sort());
    expect(instances(gates.modules.CoreLogic)).toEqual(instances(rtl.modules.CoreLogic));
    // CoreLogic's 3 register bits (phase[1:0], ped) with the async active-low reset.
    const ffs = gates.modules.CoreLogic.nodes.filter((n) => n.shape === 'register');
    expect(ffs.map((f) => f.type)).toEqual(['$_DFF_PN0_', '$_DFF_PN0_', '$_DFF_PN0_']);
    expect(ffs.map((f) => f.name).sort()).toEqual(['ped', 'phase[0]', 'phase[1]']);
    // The 2:1 Mux primitive is 2 ANDs, an OR and a NOT, as written.
    expect(gates.modules.Mux.nodes.filter((n) => n.type !== 'input' && n.type !== 'output').map((n) => n.type).sort()).toEqual(['$_AND_', '$_AND_', '$_NOT_', '$_OR_']);
  });

  it('follows instance paths from the hierarchy', () => {
    expect(resolveInstancePath(rtl, ['core', 'Counter1'])).toEqual({ module: 'CounterUnit', path: ['core', 'Counter1'] });
    expect(resolveInstancePath(rtl, ['core', 'nope', 'x'])).toEqual({ module: 'CoreLogic', path: ['core'] });
    expect(resolveInstancePath(rtl, [])).toEqual({ module: 'MainCode', path: [] });
  });

  it('lays out every module with all wires routed and no overlapping symbols', async () => {
    const elk = new ELK();
    for (const view of Object.values(rtl.modules)) {
      const l = await layoutModule(elk, view);
      for (const e of view.edges) expect(l.edges[e.id]?.points.length, `${view.name} ${e.id}`).toBeGreaterThanOrEqual(2);
      const boxes = view.nodes.map((n) => ({ ...l.nodes[n.id], w: n.width, h: n.height, id: n.id }));
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(l.width + 0.5);
        expect(b.y + b.h).toBeLessThanOrEqual(l.height + 0.5);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap, `${view.name}: ${a.id} overlaps ${b.id}`).toBe(false);
        }
      }
      // Inputs on the left, outputs on the right.
      const xs = (shape: string) => view.nodes.filter((n) => n.shape === shape).map((n) => l.nodes[n.id].x);
      if (xs('input').length && xs('output').length) expect(Math.max(...xs('input'))).toBeLessThan(Math.min(...xs('output')));
    }
  }, 60_000);
});

describe('RTL Viewer helpers', () => {
  it('names parameterised module copies readably', () => {
    expect(displayModuleName("$paramod\\Counter\\WIDTH=32'00000000000000000000000000001000")).toBe('Counter (WIDTH=8)');
    expect(displayModuleName('$paramod$a1b2c3\\Mux\\W=4')).toBe('Mux (W=4)');
    expect(displayModuleName('CoreLogic')).toBe('CoreLogic');
  });

  it('reports Yosys errors in Messages', async () => {
    const r = await buildRtlView(TRAFFIC, { ...trafficProject(), topLevelEntity: 'NoSuchModule' }, 'rtl');
    expect(r.ok).toBe(false);
    expect(r.messages.length).toBeGreaterThan(0);
    expect(r.messages.every((m) => m.source === 'rtl' && m.severity === 'error')).toBe(true);
  });
});

describe('Hierarchy from the scanner', () => {
  it('records where each instance is created', () => {
    const files = ['rtl/MainCode.v', 'rtl/CoreLogic.v', 'rtl/CounterUnit.v'];
    const scanned = files.flatMap((f) => scanModules(fs.readFileSync(path.join(TRAFFIC, f), 'utf8')).map((module) => ({ module, file: f })));
    const h = buildHierarchy('MainCode', scanned);
    expect(h.instance).toBeUndefined();
    expect(h.file).toBe('rtl/MainCode.v');
    const core = h.children.find((c) => c.instance === 'core')!;
    expect(core).toMatchObject({ module: 'CoreLogic', file: 'rtl/CoreLogic.v', instanceFile: 'rtl/MainCode.v', instanceLine: 25 });
    const counter = core.children.find((c) => c.instance === 'Counter1')!;
    expect(counter).toMatchObject({ module: 'CounterUnit', instanceFile: 'rtl/CoreLogic.v', instanceLine: 39 });
    // Modules whose files were not given are marked missing.
    expect(h.children.find((c) => c.instance === 'clkdiv')).toMatchObject({ module: 'ClockDivider', missing: true });
  });
});
