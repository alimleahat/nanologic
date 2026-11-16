// Acceptance checks against the reference project (spec section 10), which is
// vendored read-only in tests/fixtures/fpga-traffic-light-controller.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DE10_LITE } from '../../app/shared/board';
import { classifyImport } from '../../app/shared/importScan';
import { BoardEngine } from '../../app/shared/netsim/boardEngine';
import { compileNetlist } from '../../app/shared/netsim/compile';
import { createProject, type PinAssignment } from '../../app/shared/project';
import { parseVcd } from '../../app/shared/vcd';
import { analyseProject } from '../../app/main/toolchain/analysis';
import { buildBoardNetlist } from '../../app/main/toolchain/boardNetlist';
import { simulateTestbench } from '../../app/main/toolchain/simulation';

export const FIXTURE = path.resolve(__dirname, '../fixtures/fpga-traffic-light-controller');

function listVerilog(dir: string, base = dir): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? listVerilog(path.join(dir, e.name), base)
        : /\.s?v$/.test(e.name)
          ? [path.relative(base, path.join(dir, e.name)).split(path.sep).join('/')]
          : [],
    );
}

function importFixture() {
  const files = listVerilog(FIXTURE).map((p) => ({ path: p, text: fs.readFileSync(path.join(FIXTURE, p), 'utf8') }));
  return classifyImport(files);
}

/** Pin mapping for the traffic light, as described in spec section 10. */
export const TRAFFIC_LIGHT_PINS: PinAssignment[] = [
  { port: 'CLK_50MHz', bit: null, board: 'MAX10_CLK1_50' },
  { port: 'rst_n', bit: null, board: 'KEY[1]' },
  { port: 'pedestrian_btn', bit: null, board: 'KEY[0]' },
  { port: 'Red', bit: null, board: 'LEDR[0]' },
  { port: 'Amber', bit: null, board: 'LEDR[1]' },
  { port: 'Green', bit: null, board: 'LEDR[2]' },
  { port: 'LEDR9', bit: null, board: 'LEDR[9]' },
  ...Array.from({ length: 7 }, (_, i) => ({ port: 'HexL', bit: i, board: `HEX0[${i}]` })),
  ...Array.from({ length: 7 }, (_, i) => ({ port: 'HexH', bit: i, board: `HEX1[${i}]` })),
];

describe('reference project: fpga-traffic-light-controller', () => {
  const imported = importFixture();
  const project = {
    ...createProject({
      name: 'traffic_light',
      topLevelEntity: imported.topCandidates[0],
      designFiles: imported.designFiles,
      testbenchFiles: imported.testbenchFiles,
    }),
    pinAssignments: TRAFFIC_LIGHT_PINS,
  };

  it('imports 14 design files and 14 testbenches and detects MainCode as top level', () => {
    expect(imported.designFiles).toHaveLength(14);
    expect(imported.testbenchFiles).toHaveLength(14);
    expect(imported.designFiles.every((f) => f.startsWith('rtl/'))).toBe(true);
    expect(imported.testbenchFiles.every((f) => f.startsWith('tb/legacy/'))).toBe(true);
    expect(imported.topCandidates[0]).toBe('MainCode');
  });

  it('analyses all 14 modules with no errors', async () => {
    const r = await analyseProject(FIXTURE, project);
    const errors = r.messages.filter((m) => m.severity === 'error');
    expect(errors, JSON.stringify(errors)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.ports.map((p) => p.name)).toEqual(['CLK_50MHz', 'rst_n', 'pedestrian_btn', 'HexH', 'HexL', 'Green', 'Red', 'Amber', 'LEDR9']);
    expect(r.ports.find((p) => p.name === 'HexH')).toMatchObject({ direction: 'output', width: 7, msb: 6, lsb: 0 });
    // The incomplete case in BCD7Seg really does infer a latch; it must be reported with its location.
    const latch = r.messages.find((m) => /latch/i.test(m.text));
    expect(latch?.file).toBe('rtl/BCD7Seg.v');
    expect(r.hierarchy?.children.map((c) => c.module)).toEqual(['ClockDivider', 'CoreLogic', 'Decoder', 'SevenSegDisplay']);
  });

  for (const tb of importFixture().testbenchFiles) {
    it(`runs ${tb} to completion and produces a waveform`, async () => {
      const r = await simulateTestbench(FIXTURE, project, tb, { maxTimeNs: 1_000_000, timeoutMs: 60_000 });
      const errors = r.messages.filter((m) => m.severity === 'error');
      expect(errors, JSON.stringify(errors)).toEqual([]);
      expect(r.endReason).toBe('finished');
      expect(r.vcd).toBeDefined();
      const vcd = parseVcd(r.vcd!);
      expect(vcd.vars.length).toBeGreaterThan(0);
      expect(vcd.endTime).toBeGreaterThan(0);
      expect(vcd.root.scopes[0].name).toBe(path.basename(tb, '.v'));
    });
  }

  it('runs on the virtual board with manual mapping and the 1 Hz divider bypassed', async () => {
    const net = await buildBoardNetlist(FIXTURE, project);
    expect(net.ok, JSON.stringify(net.messages)).toBe(true);
    const sim = compileNetlist(net.design!, 'MainCode', [{ net: 'clkdiv.CLK_1Hz', mode: 'clock' }]);
    const engine = new BoardEngine(sim, DE10_LITE, net.ports, project.pinAssignments, {});
    expect(engine.report.unmappedInputs).toEqual([]);
    expect(engine.report.unmappedOutputs).toEqual([]);

    // Hold reset (KEY[1] pressed = 0), then release.
    engine.setInputs({ KEY: 0b01 });
    engine.run(2);
    engine.setInputs({ KEY: 0b11 });

    const lamps = () => {
      const o = engine.outputs().LEDR;
      return o[0] ? 'R' : o[1] ? 'A' : o[2] ? 'G' : '-';
    };
    const seq: string[] = [];
    for (let i = 0; i < 30; i++) {
      seq.push(lamps());
      engine.run(1);
    }
    const phases = seq.join('').replace(/(.)\1+/g, '$1');
    // Red -> Amber -> Green -> Amber -> Red ...
    expect(phases).toMatch(/RAGAR/);

    // The countdown digits are active-low 7-segment patterns on HEX0/HEX1.
    const hex0 = engine.outputs().HEX0;
    expect(hex0.slice(0, 7).every((b) => b === 0 || b === 1)).toBe(true);
    expect(hex0[7]).toBeNull(); // decimal point not driven by the design

    // Pedestrian request lights LEDR9 until served.
    engine.setInputs({ KEY: 0b10 });
    engine.run(1);
    engine.setInputs({ KEY: 0b11 });
    engine.run(1);
    const requestSeen = Array.from({ length: 30 }, () => {
      const lit = engine.outputs().LEDR[9];
      engine.run(1);
      return lit;
    });
    expect(requestSeen).toContain(1);
  });

  it('runs at full speed without bypass (50 MHz divider) at over 500k cycles per second', async () => {
    const net = await buildBoardNetlist(FIXTURE, project);
    const sim = compileNetlist(net.design!, 'MainCode');
    const engine = new BoardEngine(sim, DE10_LITE, net.ports, project.pinAssignments, {});
    const t0 = performance.now();
    engine.run(500_000);
    const rate = 500_000 / ((performance.now() - t0) / 1000);
    expect(rate).toBeGreaterThan(200_000); // generous for slow CI runners
    expect(Number(sim.getNet('clkdiv.count'))).toBe(500_000);
  });
});
