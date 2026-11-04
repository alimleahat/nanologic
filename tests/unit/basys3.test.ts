import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASYS3, findBoardBit, listBoardBits } from '../../app/shared/board';

// Digilent's master XDC, vendored unmodified (see tests/fixtures/digilent-xdc/README.md).
// Do not edit it to make a test pass: fix boards/basys3.json instead.
const XDC = fs.readFileSync(path.resolve(__dirname, '../fixtures/digilent-xdc/Basys-3-Master.xdc'), 'utf8');

/** Port name -> { pin, ioStandard } for every (commented-out) pin line in the XDC. */
function xdcPins(): Map<string, { pin: string; io: string }> {
  const map = new Map<string, { pin: string; io: string }>();
  for (const line of XDC.split(/\r?\n/)) {
    const m = /^#?\s*set_property -dict \{\s*PACKAGE_PIN (\S+)\s+IOSTANDARD (\S+)[^}]*\}\s*\[get_ports \{?([A-Za-z_]\w*(?:\[\d+\])?)\}?\]/.exec(line);
    if (m) map.set(m[3], { pin: m[1], io: m[2] });
  }
  return map;
}

describe('boards/basys3.json', () => {
  const xdc = xdcPins();

  it('records its source', () => {
    expect(BASYS3.sourceFile).toBe('Basys-3-Master.xdc');
    expect(BASYS3.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(BASYS3.status).toBe('experimental');
    expect(BASYS3.statusNote).toBe('Experimental - not yet verified on hardware');
  });

  it('targets the xc7a35tcpg236-1 with a 100 MHz clock on clk', () => {
    expect(BASYS3.device).toBe('xc7a35tcpg236-1');
    expect(BASYS3.toolchain).toBe('vivado');
    const clk = BASYS3.groups.find((g) => g.name === 'clk')!;
    expect(clk.kind).toBe('clock');
    expect(clk.frequencyHz).toBe(100_000_000);
    expect(XDC).toMatch(/create_clock -add -name sys_clk_pin -period 10\.00 .*\[get_ports clk\]/);
  });

  it('matches every pin and I/O standard in the master XDC', () => {
    const bits = listBoardBits(BASYS3);
    expect(bits.length).toBe(1 + 16 + 5 + 16 + 7 + 1 + 4);
    for (const b of bits) {
      const ref = xdc.get(b.id);
      expect(ref, `${b.id} is not in the master XDC`).toBeDefined();
      expect(b.pin, b.id).toBe(ref!.pin);
      expect(b.group.ioStandard, b.id).toBe(ref!.io);
    }
  });

  it('uses the master XDC port names for every in-scope signal', () => {
    const names = [...xdc.keys()].filter((n) => /^(clk|sw|led|seg|dp|an|btn[CULRD])(\[|$)/.test(n)).sort();
    expect(listBoardBits(BASYS3).map((b) => b.id).sort()).toEqual(names);
    expect(findBoardBit(BASYS3, 'an[0]')?.pin).toBe('U2');
    expect(findBoardBit(BASYS3, 'seg[0]')?.pin).toBe('W7');
  });

  it('has no duplicate pins', () => {
    const pins = listBoardBits(BASYS3).map((b) => b.pin);
    expect(new Set(pins).size).toBe(pins.length);
  });

  it('has the polarities from the reference manual', () => {
    const g = (n: string) => BASYS3.groups.find((x) => x.name === n)!;
    for (const n of ['sw', 'led', 'btnC', 'btnU', 'btnL', 'btnR', 'btnD']) expect(g(n).activeLow, n).toBe(false);
    for (const n of ['seg', 'dp', 'an']) expect(g(n).activeLow, n).toBe(true);
    expect(BASYS3.display).toEqual({ segments: 'seg', decimalPoint: 'dp', anodes: 'an', digits: 4 });
  });

  it('copies the configuration properties from the master XDC', () => {
    for (const prop of BASYS3.designProperties ?? []) expect(XDC).toContain(prop);
    expect(BASYS3.designProperties).toContain('set_property CONFIG_VOLTAGE 3.3 [current_design]');
  });
});

describe('shared-segment check', () => {
  const out = (name: string, width: number) => ({ name, direction: 'output' as const, width, msb: width - 1, lsb: 0, scalar: false });
  it('flags per-digit segment outputs on the Basys 3 only', async () => {
    const { perDigitSegmentPorts, validatePins } = await import('../../app/shared/pins');
    const { DE10_LITE } = await import('../../app/shared/board');
    const traffic = [out('HexH', 7), out('HexL', 7), out('led', 16)];
    expect(perDigitSegmentPorts(traffic, BASYS3).map((p) => p.name)).toEqual(['HexH', 'HexL']);
    expect(perDigitSegmentPorts(traffic, DE10_LITE)).toEqual([]);
    expect(perDigitSegmentPorts([out('seg', 7), out('an', 4), out('led', 16)], BASYS3)).toEqual([]);
    expect(perDigitSegmentPorts([out('data_a', 8), out('data_b', 8)], BASYS3)).toEqual([]);
    expect(validatePins(traffic, [], BASYS3).map((m) => m.text).join('\n')).toMatch(/share one set of segment lines/);
  });
});
