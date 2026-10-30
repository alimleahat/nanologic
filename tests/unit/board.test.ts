import { describe, expect, it } from 'vitest';
import { DE10_LITE, findBoardBit, listBoardBits } from '../../app/shared/board';

// Verbatim copy of the pin tables in NANOLOGIC_SPEC.md section 8, which were
// transcribed from the DE10-Lite User Manual (Terasic, June 5, 2020).
// Do not edit these to make a test pass: fix boards/de10-lite.json instead.
const SPEC_TABLES = `
| ADC_CLK_10 | PIN_N5 |
| MAX10_CLK1_50 | PIN_P11 |
| MAX10_CLK2_50 | PIN_N14 |
| KEY[0] | PIN_B8 |
| KEY[1] | PIN_A7 |
| SW | C10 | C11 | D12 | C12 | A12 | B12 | A13 | A14 | B14 | F15 |
| LEDR | A8 | A9 | A10 | B10 | D13 | C13 | E14 | D14 | A11 | B11 |
| HEX0 | C14 | E15 | C15 | C16 | E16 | D17 | C17 | D15 |
| HEX1 | C18 | D18 | E18 | B16 | A17 | A18 | B17 | A16 |
| HEX2 | B20 | A20 | B19 | A21 | B21 | C22 | B22 | A19 |
| HEX3 | F21 | E22 | E21 | C19 | C20 | D19 | E17 | D22 |
| HEX4 | F18 | E20 | E19 | J18 | H19 | F19 | F20 | F17 |
| HEX5 | J20 | K20 | L18 | N18 | M20 | N19 | N20 | L19 |
`;

function expectedPins(): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of SPEC_TABLES.trim().split('\n')) {
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    const [name, ...pins] = cells;
    if (pins.length === 1 && pins[0].startsWith('PIN_')) {
      map.set(name, pins[0]);
    } else {
      pins.forEach((p, bit) => map.set(`${name}[${bit}]`, `PIN_${p}`));
    }
  }
  return map;
}

describe('boards/de10-lite.json', () => {
  const expected = expectedPins();

  it('has the device and family from the manual', () => {
    expect(DE10_LITE.family).toBe('MAX 10');
    expect(DE10_LITE.device).toBe('10M50DAF484C7G');
  });

  it('matches every pin in the spec tables', () => {
    for (const [id, pin] of expected) {
      expect(findBoardBit(DE10_LITE, id)?.pin, id).toBe(pin);
    }
  });

  it('has no pins that are not in the spec tables', () => {
    const actual = listBoardBits(DE10_LITE).map((b) => b.id).sort();
    expect(actual).toEqual([...expected.keys()].sort());
  });

  it('has no duplicate pins', () => {
    const pins = listBoardBits(DE10_LITE).map((b) => b.pin);
    expect(new Set(pins).size).toBe(pins.length);
  });

  it('uses the Quartus I/O standard strings and polarities from the manual', () => {
    const g = (n: string) => DE10_LITE.groups.find((x) => x.name === n)!;
    expect(g('KEY').ioStandard).toBe('3.3 V SCHMITT TRIGGER');
    expect(g('KEY').activeLow).toBe(true);
    for (const n of ['SW', 'LEDR', 'MAX10_CLK1_50', 'MAX10_CLK2_50', 'ADC_CLK_10', 'HEX0', 'HEX5']) {
      expect(g(n).ioStandard, n).toBe('3.3-V LVTTL');
    }
    expect(g('LEDR').activeLow).toBe(false);
    expect(g('HEX0').activeLow).toBe(true);
    for (const group of DE10_LITE.groups) expect(group.ioStandard).not.toMatch(/["']/);
  });
});
