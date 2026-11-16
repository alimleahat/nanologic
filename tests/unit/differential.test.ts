// Differential test: the virtual-board simulator (Yosys netlist + NanoLogic's
// JavaScript simulator) and Icarus Verilog run the same designs with the same
// pseudo-random inputs, cycle by cycle, and every output must agree.
//
// Icarus is four-valued: an output that is still x/z there (e.g. a register
// before its first reset) is not compared, and such samples are counted
// separately. The virtual board is two-valued, so x has no counterpart.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compileNetlist, virtualBoardYosysScript } from '../../app/shared/netsim/compile';
import type { YosysDesign } from '../../app/shared/netsim/yosysJson';
import type { TopPort } from '../../app/shared/toolTypes';
import { portsFromYosys } from '../../app/main/toolchain/analysis';
import { iverilogSimulate } from '../../app/main/toolchain/iverilog';
import { runYosysCommands } from '../../app/main/toolchain/yosys';

const ROOT = path.resolve(__dirname, '../..');
const TRAFFIC = path.join(ROOT, 'tests/fixtures/fpga-traffic-light-controller/rtl');

/**
 * How an input is driven: uniformly random, or a reset that is asserted for
 * the first cycles and then only rarely (so counters get to run).
 */
type InputMode = 'random' | 'activeLowReset' | 'activeHighReset';

interface DesignSpec {
  label: string;
  dir: string;
  files: string[];
  top: string;
  cycles: number;
  params?: Record<string, number>;
  inputs?: Record<string, InputMode>;
  /**
   * Internal signals compared as well, by their flattened name (e.g.
   * "clkdiv.count"). Used where the outputs change too rarely to be a test on
   * their own, such as behind a 50 MHz -> 1 Hz divider.
   */
  probes?: string[];
}

const trafficFiles = fs.readdirSync(TRAFFIC).filter((f) => f.endsWith('.v')).sort();
const trafficModule = (top: string, cycles: number, inputs?: Record<string, InputMode>, probes?: string[]): DesignSpec => ({
  label: `traffic light: ${top}`,
  dir: TRAFFIC,
  files: trafficFiles,
  top,
  cycles,
  inputs,
  probes,
});

const DESIGNS: DesignSpec[] = [
  {
    label: 'DE10-Lite starter (DIV = 5)',
    dir: path.join(ROOT, 'examples/starter-de10lite'),
    files: ['top.v', 'hex_to_7seg.v'],
    top: 'top',
    cycles: 4000,
    params: { DIV: 5 },
    inputs: { KEY: 'activeLowReset' },
  },
  {
    label: 'Basys 3 starter (REFRESH_BITS = 6, AUTO_BITS = 7)',
    dir: path.join(ROOT, 'examples/basys3-starter'),
    files: ['top.v', 'hex_to_7seg.v'],
    top: 'top',
    cycles: 4000,
    params: { REFRESH_BITS: 6, AUTO_BITS: 7 },
    inputs: { btnC: 'activeHighReset' },
  },
  trafficModule('MainCode', 4000, { rst_n: 'activeLowReset' }, ['clkdiv.count', 'ControlSignal', 'Count']),
  trafficModule('ClockDivider', 4000, { rst_n: 'activeLowReset' }, ['count']),
  trafficModule('CoreLogic', 4000, { rst_n: 'activeLowReset' }),
  trafficModule('CounterUnit', 4000, { rst_n: 'activeLowReset' }),
  ...['Decoder', 'SevenSegDisplay', 'BinaryBCD', 'BCD7Seg', 'Subtractor', 'FourBitFullAdder', 'OneBitFullAdder', 'Comparator4', 'Mux2Way4', 'Mux'].map(
    (m) => trafficModule(m, 1000),
  ),
];

const isClock = (p: TopPort) => p.direction === 'input' && p.width === 1 && /clk|clock/i.test(p.name);

/** Deterministic PRNG (xorshift32) so failures are reproducible. */
function prng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

function randomBits(rnd: () => number, width: number): bigint {
  let v = 0n;
  for (let i = 0; i < width; i += 16) v = (v << 16n) | BigInt(Math.floor(rnd() * 0x10000));
  return v & ((1n << BigInt(width)) - 1n);
}

function inputValue(mode: InputMode, cycle: number, width: number, rnd: () => number): bigint {
  const ones = (1n << BigInt(width)) - 1n;
  const asserted = cycle < 3 || rnd() < 1 / 40;
  if (mode === 'activeLowReset') return asserted ? 0n : ones;
  if (mode === 'activeHighReset') return asserted ? ones : 0n;
  return randomBits(rnd, width);
}

async function netlistFor(spec: DesignSpec): Promise<YosysDesign> {
  const files = Object.fromEntries(spec.files.map((f) => [f, fs.readFileSync(path.join(spec.dir, f), 'utf8')]));
  const chparams = Object.entries(spec.params ?? {}).map(([k, v]) => `chparam -set ${k} ${v} ${spec.top}`);
  const r = await runYosysCommands(
    files,
    [`read_verilog ${spec.files.join(' ')}`, ...chparams, ...virtualBoardYosysScript(spec.top), 'write_json o.json'],
    ['o.json'],
  );
  if (!r.ok) throw new Error(r.log);
  return JSON.parse(r.outputs['o.json']);
}

const range = (p: TopPort) => (p.scalar ? '' : `[${p.msb}:${p.lsb}]`);

/** A testbench applying `vectors` with the same edge order as the netlist simulator. */
function testbench(spec: DesignSpec, ports: TopPort[], vectors: Map<string, bigint>[]): string {
  const ins = ports.filter((p) => p.direction !== 'output');
  const outs = ports.filter((p) => p.direction === 'output');
  const clock = ins.find(isClock);
  const params = Object.entries(spec.params ?? {})
    .map(([k, v]) => `.${k}(${v})`)
    .join(', ');
  const lines = [
    '`timescale 1ns/1ps',
    'module __diff_tb;',
    ...ins.map((p) => `  reg ${range(p)} ${p.name} = 0;`),
    ...outs.map((p) => `  wire ${range(p)} ${p.name};`),
    `  ${spec.top} ${params ? `#(${params}) ` : ''}dut (${ports.map((p) => `.${p.name}(${p.name})`).join(', ')});`,
    '  initial begin',
  ];
  const shown = [...outs.map((p) => p.name), ...(spec.probes ?? []).map((n) => `dut.${n}`)];
  const show = `$display("${shown.map(() => '%b').join(' ')}", ${shown.join(', ')});`;
  for (const vec of vectors) {
    const sets = ins.filter((p) => p !== clock).map((p) => `${p.name} = ${p.width}'h${vec.get(p.name)!.toString(16)};`);
    lines.push(`    ${sets.join(' ')} #1;${clock ? ` ${clock.name} = 1; #1;` : ''} ${show}${clock ? ` ${clock.name} = 0; #1;` : ''}`);
  }
  lines.push('    $finish;', '  end', 'endmodule', '');
  return lines.join('\n');
}

interface Result {
  label: string;
  cycles: number;
  outputs: number;
  compared: number;
  unknown: number;
  mismatches: string[];
}

async function runDifferential(spec: DesignSpec): Promise<Result> {
  const design = await netlistFor(spec);
  const ports = portsFromYosys(design, spec.top);
  const ins = ports.filter((p) => p.direction !== 'output');
  const outs = ports.filter((p) => p.direction === 'output');
  const clock = ins.find(isClock);

  // Same seed for every run of this design.
  const rnd = prng([...spec.label].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
  const vectors: Map<string, bigint>[] = [];
  for (let c = 0; c < spec.cycles; c++) {
    const vec = new Map<string, bigint>();
    for (const p of ins) if (p !== clock) vec.set(p.name, inputValue(spec.inputs?.[p.name] ?? 'random', c, p.width, rnd));
    vectors.push(vec);
  }

  // Icarus Verilog.
  const sources = spec.files.map((f) => ({ path: f, text: fs.readFileSync(path.join(spec.dir, f), 'utf8') }));
  sources.push({ path: '__diff_tb.v', text: testbench(spec, ports, vectors) });
  const ref = await iverilogSimulate(
    sources,
    sources.map((s) => s.path),
    [],
    120_000,
  );
  if (!ref.ok) throw new Error(`Icarus failed for ${spec.label}:\n${ref.output.slice(0, 2000)}`);
  const refLines = ref.output
    .split(/\r?\n/)
    .filter((l) => /^[01xz ]+$/.test(l.trim()) && l.trim().length > 0)
    .map((l) => l.trim().split(' '));
  expect(refLines.length, `${spec.label}: Icarus printed ${refLines.length} samples`).toBe(spec.cycles);

  // Virtual-board simulator.
  const sim = compileNetlist(design, spec.top);
  const probes = spec.probes ?? [];
  for (const n of probes) expect(sim.nets.some((x) => x.name === n), `probe ${n} exists in the netlist`).toBe(true);
  const observed = [
    ...outs.map((p) => ({ name: p.name, width: p.width, read: () => sim.getOutput(p.name) })),
    ...probes.map((n) => ({ name: n, width: sim.nets.find((x) => x.name === n)!.width, read: () => sim.getNet(n) })),
  ];
  const result: Result = { label: spec.label, cycles: spec.cycles, outputs: observed.length, compared: 0, unknown: 0, mismatches: [] };
  vectors.forEach((vec, c) => {
    for (const [name, v] of vec) sim.setInput(name, ins.find((p) => p.name === name)!.width > 32 ? v : Number(v));
    sim.settle();
    if (clock) {
      sim.setInput(clock.name, 1);
      sim.settle();
    }
    observed.forEach((p, i) => {
      const expected = refLines[c][i];
      if (/[xz]/.test(expected)) {
        result.unknown++;
        return;
      }
      const got = BigInt(p.read()).toString(2).padStart(p.width, '0');
      result.compared++;
      if (got !== expected && result.mismatches.length < 5) {
        result.mismatches.push(`cycle ${c}: ${p.name} = ${got}, Icarus ${expected} (inputs ${[...vec].map(([k, x]) => `${k}=${x.toString(16)}`).join(' ')})`);
      }
    });
    if (clock) {
      sim.setInput(clock.name, 0);
      sim.settle();
    }
  });
  return result;
}

const results: Result[] = [];

describe('virtual-board simulator matches Icarus Verilog on random inputs', () => {
  for (const spec of DESIGNS) {
    it(spec.label, async () => {
      const r = await runDifferential(spec);
      results.push(r);
      expect(r.mismatches, r.mismatches.join('\n')).toEqual([]);
      // Most samples must be fully known in Icarus, or the comparison would be hollow.
      expect(r.compared).toBeGreaterThan(0.9 * (r.compared + r.unknown));
    });
  }

  afterAll(() => {
    const rows = results.map(
      (r) => `| ${r.label} | ${r.cycles} | ${r.outputs} | ${r.compared} | ${r.unknown} | ${r.mismatches.length ? 'MISMATCH' : 'match'} |`,
    );
    const totalCycles = results.reduce((s, r) => s + r.cycles, 0);
    const totalCompared = results.reduce((s, r) => s + r.compared, 0);
    const table = [
      '| Design | Cycles | Signals compared | Samples compared | Skipped (x/z in Icarus) | Result |',
      '|---|---|---|---|---|---|',
      ...rows,
      `| **Total (${results.length} designs)** | **${totalCycles}** | | **${totalCompared}** | | |`,
    ].join('\n');
    console.log(`\nDifferential test summary\n${table}\n`);
    fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'test-results', 'differential-summary.md'), table + '\n');
  });
});
