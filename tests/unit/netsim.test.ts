import { describe, expect, it } from 'vitest';
import { compileNetlist, virtualBoardYosysScript } from '../../app/shared/netsim/compile';
import type { YosysDesign } from '../../app/shared/netsim/yosysJson';
import { runYosysCommands } from '../../app/main/toolchain/yosys';
import { iverilogSimulate } from '../../app/main/toolchain/iverilog';

async function netlist(files: Record<string, string>, top: string): Promise<YosysDesign> {
  const r = await runYosysCommands(
    files,
    [`read_verilog ${Object.keys(files).join(' ')}`, ...virtualBoardYosysScript(top), 'write_json out.json'],
    ['out.json'],
  );
  if (!r.ok) throw new Error(r.log);
  return JSON.parse(r.outputs['out.json']);
}

const COUNTER = `
module counter (
  input clk,
  input rst_n,
  input en,
  output reg [3:0] q,
  output wrap,
  output reg [39:0] big
);
  always @(posedge clk or negedge rst_n)
    if (!rst_n) q <= 4'd0;
    else if (en) q <= q + 4'd1;
  always @(posedge clk) big <= big + 40'h0100000001;
  assign wrap = &q;
endmodule
`;

describe('virtual board netlist simulator', () => {
  it('runs a small counter with asynchronous reset and enable', async () => {
    const sim = compileNetlist(await netlist({ 'counter.v': COUNTER }, 'counter'), 'counter');
    expect(sim.inputs.map((p) => p.name).sort()).toEqual(['clk', 'en', 'rst_n']);
    const cycle = () => {
      sim.setInput('clk', 1);
      sim.settle();
      sim.setInput('clk', 0);
      sim.settle();
    };
    sim.setInput('rst_n', 0);
    sim.settle();
    expect(sim.getOutput('q')).toBe(0);
    sim.setInput('rst_n', 1);
    sim.setInput('en', 1);
    sim.settle();
    for (let i = 1; i <= 20; i++) {
      cycle();
      expect(sim.getOutput('q')).toBe(i % 16);
      expect(sim.getOutput('wrap')).toBe(i % 16 === 15 ? 1 : 0);
      expect(sim.getOutput('big')).toBe(BigInt(i) * 0x0100000001n);
    }
    sim.setInput('en', 0);
    cycle();
    expect(sim.getOutput('q')).toBe(4);
    sim.setInput('rst_n', 0);
    sim.settle();
    expect(sim.getOutput('q')).toBe(0);
  });

  it('handles latches inferred from incomplete case statements', async () => {
    const src = `module dec(input [3:0] bcd, output reg [6:0] seg);
      always @(*) case (bcd) 4'd0: seg = 7'h40; 4'd1: seg = 7'h79; endcase
    endmodule`;
    const sim = compileNetlist(await netlist({ 'dec.v': src }, 'dec'), 'dec');
    sim.setInput('bcd', 1);
    sim.settle();
    expect(sim.getOutput('seg')).toBe(0x79);
    sim.setInput('bcd', 7); // not covered: latch holds
    sim.settle();
    expect(sim.getOutput('seg')).toBe(0x79);
    sim.setInput('bcd', 0);
    sim.settle();
    expect(sim.getOutput('seg')).toBe(0x40);
  });

  it('can bypass a divided clock with the board clock', async () => {
    const src = `module top(input clk, output reg [3:0] n);
      reg [24:0] div = 0; reg slow = 0;
      always @(posedge clk) if (div == 25'd24999999) begin div <= 0; slow <= ~slow; end else div <= div + 1'b1;
      always @(posedge slow) n <= n + 1'b1;
    endmodule`;
    const design = await netlist({ 'top.v': src }, 'top');
    const sim = compileNetlist(design, 'top', [{ net: 'slow', mode: 'clock' }]);
    expect(sim.nets.find((n) => n.name === 'slow')?.registered).toBe(true);
    for (let i = 0; i < 5; i++) {
      sim.setOverrideClock(1);
      sim.settle();
      sim.setOverrideClock(0);
      sim.settle();
    }
    expect(sim.getOutput('n')).toBe(5);
  });

  it('matches Icarus Verilog on random inputs for arithmetic, logic and shifts', async () => {
    const alu = `
module alu (
  input [7:0] a8, input [7:0] b8, input signed [7:0] sa, input signed [7:0] sb,
  input [31:0] a32, input [31:0] b32, input [39:0] a40, input [39:0] b40, input [2:0] sh,
  output [7:0] add8, output [7:0] sub8, output [15:0] mul16, output [7:0] div8, output [7:0] mod8,
  output lt_u, output lt_s, output ge_s, output eq8,
  output [31:0] add32, output [31:0] mul32, output [31:0] xor32, output [31:0] not32,
  output [39:0] add40, output [39:0] sub40, output lt40, output [39:0] and40,
  output [7:0] shl8, output [7:0] shr8, output signed [7:0] sshr8, output [3:0] part,
  output red_xor, output red_and, output logic_and, output [15:0] cat, output signed [15:0] sext,
  output signed [7:0] sdiv, output signed [7:0] smod, output [7:0] muxed
);
  assign add8 = a8 + b8;
  assign sub8 = a8 - b8;
  assign mul16 = a8 * b8;
  assign div8 = (b8 == 0) ? 8'd0 : a8 / b8;
  assign mod8 = (b8 == 0) ? 8'd0 : a8 % b8;
  assign lt_u = a8 < b8;
  assign lt_s = sa < sb;
  assign ge_s = sa >= sb;
  assign eq8 = a8 == b8;
  assign add32 = a32 + b32;
  assign mul32 = a32 * b32;
  assign xor32 = a32 ^ b32;
  assign not32 = ~a32;
  assign add40 = a40 + b40;
  assign sub40 = a40 - b40;
  assign lt40 = a40 < b40;
  assign and40 = a40 & b40;
  assign shl8 = a8 << sh;
  assign shr8 = a8 >> sh;
  assign sshr8 = sa >>> sh;
  assign part = a8[sh +: 4];
  assign red_xor = ^a32;
  assign red_and = &a8;
  assign logic_and = a8 && b8;
  assign cat = {a8[3:0], b8, a8[7:4]};
  assign sext = sa;
  assign sdiv = (sb == 0) ? 8'sd0 : sa / sb;
  assign smod = (sb == 0) ? 8'sd0 : sa % sb;
  assign muxed = sh[0] ? (sh[1] ? a8 : b8) : (sh[2] ? sa : sb);
endmodule
`;
    const outs = [
      'add8', 'sub8', 'mul16', 'div8', 'mod8', 'lt_u', 'lt_s', 'ge_s', 'eq8', 'add32', 'mul32', 'xor32', 'not32',
      'add40', 'sub40', 'lt40', 'and40', 'shl8', 'shr8', 'sshr8', 'part', 'red_xor', 'red_and', 'logic_and', 'cat',
      'sext', 'sdiv', 'smod', 'muxed',
    ];
    // Deterministic pseudo-random vectors.
    let seed = 12345;
    const rnd = (bits: number): bigint => {
      let v = 0n;
      for (let i = 0; i < bits; i += 16) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        v = (v << 16n) | BigInt(seed & 0xffff);
      }
      return v & ((1n << BigInt(bits)) - 1n);
    };
    const inputs = { a8: 8, b8: 8, sa: 8, sb: 8, a32: 32, b32: 32, a40: 40, b40: 40, sh: 3 } as const;
    const vectors = Array.from({ length: 60 }, (_, i) => {
      const v: Record<string, bigint> = {};
      for (const [k, w] of Object.entries(inputs)) v[k] = rnd(w);
      if (i % 7 === 0) v.b8 = v.a8; // exercise equality
      if (i % 11 === 0) v.sb = 0n;
      return v;
    });

    const tbLines = vectors.map(
      (v) =>
        `${Object.keys(inputs).map((k) => `${k} = ${v[k]};`).join(' ')} #1 $display("${outs.map(() => '%0d').join(' ')}", ${outs.map((o) => `$unsigned(${o})`).join(', ')});`,
    );
    const tb = `module tb;
  reg [7:0] a8, b8; reg signed [7:0] sa, sb; reg [31:0] a32, b32; reg [39:0] a40, b40; reg [2:0] sh;
  wire [7:0] add8, sub8, div8, mod8, shl8, shr8, muxed; wire [15:0] mul16, cat; wire lt_u, lt_s, ge_s, eq8, lt40, red_xor, red_and, logic_and;
  wire [31:0] add32, mul32, xor32, not32; wire [39:0] add40, sub40, and40; wire signed [7:0] sshr8, sdiv, smod; wire [3:0] part; wire signed [15:0] sext;
  alu dut(.a8(a8), .b8(b8), .sa(sa), .sb(sb), .a32(a32), .b32(b32), .a40(a40), .b40(b40), .sh(sh),
    ${outs.map((o) => `.${o}(${o})`).join(', ')});
  initial begin
    ${tbLines.join('\n    ')}
    $finish;
  end
endmodule`;
    const ref = await iverilogSimulate(
      [
        { path: 'alu.v', text: alu },
        { path: 'tb.v', text: tb },
      ],
      ['alu.v', 'tb.v'],
      [],
      60_000,
    );
    expect(ref.ok, ref.output).toBe(true);
    const refLines = ref.output
      .split('\n')
      .filter((l) => /^\d/.test(l))
      .map((l) => l.trim());
    expect(refLines.length).toBe(vectors.length);

    const sim = compileNetlist(await netlist({ 'alu.v': alu }, 'alu'), 'alu');
    vectors.forEach((v, i) => {
      for (const k of Object.keys(inputs)) sim.setInput(k, v[k]);
      sim.settle();
      const got = outs.map((o) => BigInt(sim.getOutput(o)).toString()).join(' ');
      expect(got, `vector ${i}`).toBe(refLines[i]);
    });
  });
});
