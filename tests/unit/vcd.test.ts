import { describe, expect, it } from 'vitest';
import { formatValue, parseVcd, valueIndexAt } from '../../app/shared/vcd';

const SMALL = `$date today $end
$timescale 1ns $end
$scope module tb $end
$var reg 1 ! clk $end
$var wire 4 " count [3:0] $end
$scope module dut $end
$var wire 4 " q [3:0] $end
$var real 1 # r $end
$upscope $end
$upscope $end
$enddefinitions $end
#0
$dumpvars
0!
bx "
r0.5 #
$end
#5
1!
b11 "
#10
0!
b1010 "
#10
b1011 "
`;

describe('VCD parser', () => {
  it('reads scopes, aliases, buses, reals and same-time updates', () => {
    const v = parseVcd(SMALL);
    expect(v.timescale).toEqual({ magnitude: 1, unit: 'ns' });
    expect(v.secondsPerUnit).toBe(1e-9);
    expect(v.vars.map((x) => x.path)).toEqual(['tb.clk', 'tb.count', 'tb.dut.q', 'tb.dut.r']);
    expect(v.vars[1].track).toBe(v.vars[2].track); // alias shares data
    const count = v.tracks[v.vars[1].track];
    expect(Array.from(count.times)).toEqual([0, 5, 10]);
    expect(count.values).toEqual(['xxxx', '0011', '1011']);
    expect(v.tracks[v.vars[0].track].values).toEqual(['0', '1', '0']);
    expect(v.tracks[v.vars[3].track].values).toEqual(['0.5']);
    expect(valueIndexAt(count, 7)).toBe(1);
    expect(v.endTime).toBe(10);
  });

  it('formats values in each radix', () => {
    expect(formatValue('11110000', 'hex')).toBe('F0');
    expect(formatValue('11110000', 'unsigned')).toBe('240');
    expect(formatValue('11110000', 'signed')).toBe('-16');
    expect(formatValue('1x00', 'hex')).toBe('x');
    expect(formatValue('0000x000', 'hex')).toBe('0x');
  });

  it('parses a 50 MB VCD in reasonable time', () => {
    const header =
      '$timescale 1ps $end\n$scope module tb $end\n$var reg 1 ! clk $end\n$var reg 32 " data [31:0] $end\n$var reg 8 # b [7:0] $end\n$upscope $end\n$enddefinitions $end\n';
    const parts: string[] = [header];
    let size = header.length;
    let t = 0;
    let d = 0;
    while (size < 50 * 1024 * 1024) {
      d = (d * 1664525 + 1013904223) >>> 0;
      const chunk = `#${t}\n1!\nb${d.toString(2)} "\n#${t + 5}\n0!\nb${(d & 255).toString(2)} #\n`;
      parts.push(chunk);
      size += chunk.length;
      t += 10;
    }
    const text = parts.join('');
    const t0 = performance.now();
    const v = parseVcd(text);
    const ms = performance.now() - t0;
    expect(v.tracks[0].times.length).toBeGreaterThan(1_000_000);
    expect(v.tracks[1].values[0]).toHaveLength(32);
    // Typically 1-3 s; allow slow CI machines.
    expect(ms).toBeLessThan(20_000);
    console.log(`50 MB VCD parsed in ${Math.round(ms)} ms (${v.tracks[0].times.length} clock edges)`);
  });
});
