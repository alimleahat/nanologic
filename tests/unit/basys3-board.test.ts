import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASYS3 } from '../../app/shared/board';
import { BoardEngine } from '../../app/shared/netsim/boardEngine';
import { compileNetlist, virtualBoardYosysScript } from '../../app/shared/netsim/compile';
import type { YosysDesign } from '../../app/shared/netsim/yosysJson';
import { autoMap } from '../../app/shared/pins';
import { parseProject } from '../../app/shared/project';
import { analyseProject, portsFromYosys } from '../../app/main/toolchain/analysis';
import { buildBoardNetlist } from '../../app/main/toolchain/boardNetlist';
import { simulateTestbench } from '../../app/main/toolchain/simulation';
import { runYosysCommands } from '../../app/main/toolchain/yosys';

const ROOT = path.resolve(__dirname, '../..');
const STARTER = path.join(ROOT, 'examples/basys3-starter');

// Segment patterns (bit 0 = top ... 6 = middle), lit = 1.
const LIT: Record<string, number[]> = {
  '0': [1, 1, 1, 1, 1, 1, 0],
  '1': [0, 1, 1, 0, 0, 0, 0],
  '2': [1, 1, 0, 1, 1, 0, 1],
};

/** The digit each position shows, judged from brightness (>= 0.8 lit, <= 0.2 off), or '?' . */
function readDigits(engine: BoardEngine, mode: 'persistence' | 'instant' = 'persistence'): string {
  const frame = engine.display(mode)!;
  return [3, 2, 1, 0]
    .map((d) => {
      const b = frame.digits[d].slice(0, 7);
      if (b.some((x) => x > 0.2 && x < 0.8)) return '?';
      const pattern = b.map((x) => (x >= 0.8 ? 1 : 0));
      if (pattern.every((x) => x === 0)) return ' ';
      return Object.entries(LIT).find(([, p]) => p.every((v, i) => v === pattern[i]))?.[0] ?? '#';
    })
    .join('');
}

async function engineFor(src: string, top = 'top'): Promise<BoardEngine> {
  const r = await runYosysCommands({ 'd.v': src }, ['read_verilog d.v', ...virtualBoardYosysScript(top), 'write_json o.json'], ['o.json']);
  if (!r.ok) throw new Error(r.log);
  const design = JSON.parse(r.outputs['o.json']) as YosysDesign;
  const ports = portsFromYosys(design, top);
  return new BoardEngine(compileNetlist(design, top), BASYS3, ports, autoMap(ports, BASYS3), {});
}

/** A 4-digit display of "2100", scanned every 2^SHIFT cycles, with segments lagging the anodes by LAG cycles. */
function scanDesign(shift: number, lag: number): string {
  return `module top(input clk, output [6:0] seg, output dp, output [3:0] an);
  reg [${shift + 1}:0] r = 0;
  always @(posedge clk) r <= r + 1'b1;
  wire [1:0] d = r[${shift + 1}:${shift}];
  reg [1:0] dl [0:${Math.max(lag, 1)}];
  integer i;
  always @(posedge clk) begin dl[0] <= d; for (i = 1; i <= ${Math.max(lag, 1)}; i = i + 1) dl[i] <= dl[i-1]; end
  wire [1:0] sd = ${lag === 0 ? 'd' : `dl[${lag - 1}]`};
  // digit 3..0 = 2,1,0,0 ; segments lit when 0
  assign seg = (sd == 2'd3) ? ~7'b1011011 : (sd == 2'd2) ? ~7'b0000110 : ~7'b0111111;
  assign dp = 1'b1;
  assign an = ~(4'b0001 << d);
endmodule`;
}

describe('Basys 3 multiplexed display (persistence of vision)', () => {
  it('shows a correctly scanned display steadily', async () => {
    const e = await engineFor(scanDesign(12, 0));
    e.run(3_000_000);
    expect(readDigits(e)).toBe('2100');
    e.run(500_000);
    expect(readDigits(e)).toBe('2100');
  });

  it('ghosts when the segments change after the anodes', async () => {
    const e = await engineFor(scanDesign(6, 16)); // segments 16 cycles late out of 64 per digit
    e.run(3_000_000);
    const frame = e.display('persistence')!;
    // Digit 0 ("0") faintly shows the middle segment from digit 3's "2" next to it.
    expect(frame.digits[0][6]).toBeGreaterThan(0.2);
    expect(frame.digits[0][6]).toBeLessThan(0.8);
    expect(readDigits(e)).toContain('?');
  });

  it('flickers when the scan is slower than the eye', async () => {
    const e = await engineFor(scanDesign(23, 0)); // one digit every 8.4 M cycles (84 ms)
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      e.run(2_800_000);
      seen.add(readDigits(e));
    }
    // At any moment at most one digit is lit, and which one changes over time.
    for (const s of seen) expect(s.replace(/[ ?]/g, '').length).toBeLessThanOrEqual(1);
    expect(seen.size).toBeGreaterThan(1);
  });

  it('shows the enabled digit only in instant mode (slow clocks)', async () => {
    const e = await engineFor(scanDesign(1, 0));
    e.run(1);
    expect(readDigits(e, 'instant').replace(/ /g, '')).toHaveLength(1);
  });
});

describe('Basys 3 starter example', () => {
  const project = parseProject(fs.readFileSync(path.join(STARTER, 'basys3_starter.nlproj'), 'utf8'));

  it('analyses cleanly and its testbench runs', async () => {
    const a = await analyseProject(STARTER, project);
    expect(a.messages.filter((m) => m.severity === 'error' || m.severity === 'warning')).toEqual([]);
    expect(a.ports.map((p) => p.name).sort()).toEqual(['an', 'btnC', 'btnD', 'btnL', 'btnR', 'btnU', 'clk', 'dp', 'led', 'seg', 'sw'].sort());
    const s = await simulateTestbench(STARTER, project, 'top_tb.v');
    expect(s.endReason).toBe('finished');
    const text = s.messages.map((m) => m.text).join('\n');
    expect(text).toMatch(/count = [1-9]\d*, led = 8001/);
    expect(text).toMatch(/after reset: count = 0/);
  });

  it('runs on the virtual board: switches to LEDs, counter scanned across all four digits', async () => {
    const net = await buildBoardNetlist(STARTER, project);
    expect(net.ok, JSON.stringify(net.messages)).toBe(true);
    const pins = autoMap(net.ports, BASYS3);
    expect(pins).toHaveLength(1 + 16 + 5 + 16 + 7 + 1 + 4);
    const e = new BoardEngine(compileNetlist(net.design!, 'top'), BASYS3, net.ports, pins, {});

    e.setInputs({ sw: 0b1000_0000_0000_0101 });
    expect(e.outputs().led.slice(0, 4)).toEqual([1, 0, 1, 0]);
    e.setInputs({ sw: 0 });

    e.run(2_000_000);
    expect(readDigits(e)).toBe('0000');

    // Press btnU (buttons read 1 while pressed): the counter goes to 0001.
    e.setInputs({ btnU: 1 });
    e.run(600_000);
    e.setInputs({ btnU: 0 });
    e.run(2_000_000);
    expect(readDigits(e)).toBe('0001');

    e.setInputs({ btnU: 1 });
    e.run(600_000);
    e.setInputs({ btnU: 0 });
    e.run(2_000_000);
    expect(readDigits(e)).toBe('0002');

    // btnC resets.
    e.setInputs({ btnC: 1 });
    e.run(10);
    e.setInputs({ btnC: 0 });
    e.run(2_000_000);
    expect(readDigits(e)).toBe('0000');
  });
});
