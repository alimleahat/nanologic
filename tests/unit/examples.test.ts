// The shipped examples work, and examples/traffic-light-export/ matches what
// the exporter produces. Regenerate it with: npm run examples:export
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DE10_LITE } from '../../app/shared/board';
import { BoardEngine } from '../../app/shared/netsim/boardEngine';
import { compileNetlist } from '../../app/shared/netsim/compile';
import { autoMap } from '../../app/shared/pins';
import { parseProject } from '../../app/shared/project';
import { generateExport } from '../../app/shared/quartusExport';
import { analyseProject } from '../../app/main/toolchain/analysis';
import { buildBoardNetlist } from '../../app/main/toolchain/boardNetlist';
import { simulateTestbench } from '../../app/main/toolchain/simulation';
import { writeExport } from '../../app/main/exportFs';

const ROOT = path.resolve(__dirname, '../..');
const FIXTURE = path.join(ROOT, 'tests/fixtures/fpga-traffic-light-controller');
const EXPORT_DIR = path.join(ROOT, 'examples/traffic-light-export');
// Fixed timestamp so the committed export is reproducible.
const EXPORT_DATE = new Date(2026, 9, 30, 9, 0, 0);

describe('reference project export (examples/traffic-light-export)', () => {
  const project = parseProject(fs.readFileSync(path.join(ROOT, 'examples/traffic-light/traffic_light.nlproj'), 'utf8'));

  it('matches a fresh level 3 export', async () => {
    const analysis = await analyseProject(FIXTURE, project);
    expect(analysis.ok).toBe(true);
    const out = generateExport({
      project,
      board: DE10_LITE,
      ports: analysis.ports,
      sources: project.designFiles.map((f) => ({ path: f, text: fs.readFileSync(path.join(FIXTURE, f), 'utf8') })),
      level: 3,
      date: EXPORT_DATE,
    });
    expect(out.messages.filter((m) => m.severity === 'error')).toEqual([]);
    expect(out.messages.filter((m) => m.severity === 'warning')).toEqual([]);

    if (process.env.UPDATE_EXAMPLES === '1') {
      fs.rmSync(EXPORT_DIR, { recursive: true, force: true });
      await writeExport(EXPORT_DIR, out.files);
    }
    for (const f of out.files) {
      const disk = fs.readFileSync(path.join(EXPORT_DIR, ...f.path.split('/')), 'utf8');
      expect(disk, `${f.path} is out of date: run npm run examples:export`).toBe(f.content);
    }

    const qsf = out.files.find((f) => f.path === 'traffic_light.qsf')!.content;
    // The board file's device, not the reference project's 10M50DAF484C6GES.
    expect(qsf).toContain('set_global_assignment -name DEVICE 10M50DAF484C7G');
    expect(qsf).not.toContain('C6GES');
    expect(qsf).toContain('set_global_assignment -name TOP_LEVEL_ENTITY MainCode');
    for (const a of project.pinAssignments) {
      const name = a.bit === null ? a.port : `${a.port}[${a.bit}]`;
      expect(qsf).toMatch(new RegExp(`set_location_assignment PIN_\\w+ -to ${name.replace(/[[\]]/g, '\\$&')}\\n`));
    }
    expect(qsf).toContain('set_location_assignment PIN_B8 -to pedestrian_btn');
    expect(qsf).toContain('set_location_assignment PIN_P11 -to CLK_50MHz');
    expect(qsf).toContain('set_instance_assignment -name IO_STANDARD "3.3 V SCHMITT TRIGGER" -to rst_n');
    expect((qsf.match(/VERILOG_FILE/g) ?? []).length).toBe(14);
    expect(qsf).not.toMatch(/_tb\.v/);
    const sdc = out.files.find((f) => f.path === 'traffic_light.sdc')!.content;
    expect(sdc).toContain('create_clock -name {CLK_50MHz} -period 20.000 [get_ports {CLK_50MHz}]');
  });
});

describe('starter example', () => {
  const dir = path.join(ROOT, 'examples/starter-de10lite');
  const project = parseProject(fs.readFileSync(path.join(dir, 'starter.nlproj'), 'utf8'));

  it('analyses cleanly and its testbench runs', async () => {
    const a = await analyseProject(dir, project);
    expect(a.messages.filter((m) => m.severity !== 'info')).toEqual([]);
    const s = await simulateTestbench(dir, project, 'top_tb.v');
    expect(s.endReason).toBe('finished');
    // 400 ns of 20 ns clocks after reset, one count per 4 clocks.
    expect(s.messages.map((m) => m.text).join('\n')).toMatch(/count = (4|5), HEX0 = 1\d{7}, LEDR = 1010101010/);
  });

  it('runs on the virtual board with the right polarities', async () => {
    const net = await buildBoardNetlist(dir, project);
    expect(net.ok).toBe(true);
    const pins = autoMap(net.ports, DE10_LITE);
    const sim = compileNetlist(net.design!, 'top', project.virtualBoard.bypass);
    const board = new BoardEngine(sim, DE10_LITE, net.ports, pins, {});
    const hex0 = () => board.outputs().HEX0.join('');
    expect(hex0()).toBe('00000011'); // "0": all segments lit (0) except the middle, DP off
    board.setInputs({ SW: 0b1000000001 });
    expect(board.outputs().LEDR).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    board.run(1);
    expect(hex0()).toBe('10011111'); // "1"
    board.run(14);
    expect(hex0()).toBe('01110001'); // "F" = 0001110 (segments 0,4,5,6 lit)
    board.setInputs({ KEY: 0b10 }); // hold KEY[0]: reset (active-low)
    expect(hex0()).toBe('00000011');
  });
});
