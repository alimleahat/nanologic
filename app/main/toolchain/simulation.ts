// Testbench simulation with Icarus Verilog, producing a VCD waveform.
import path from 'node:path';
import type { Message } from '../../shared/messages';
import type { NanoLogicProject } from '../../shared/project';
import type { SimulationResult } from '../../shared/toolTypes';
import { isTestbenchModule, scanModules } from '../../shared/verilogScan';
import { TOOLCHAIN } from './config';
import { iverilogSimulate, stopAsFinish } from './iverilog';
import { parseIverilogOutput } from './parseOutput';
import { stageSources, virtToDisplay } from './sources';

const HELPER_FILE = '__nanologic_sim.v';
// Compiled first so files without `timescale use 1 ns units, like ModelSim
// (Icarus would otherwise default to 1 s). Directives carry over between files.
const TIMESCALE_FILE = '__nanologic_timescale.v';
const HELPER_MODULE = '__nanologic_sim';
const MAX_TIME_MARK = 'NanoLogic: stopped at the maximum simulation time';

/** Verilog for the helper module that dumps the waveform and enforces the max time. */
export function simulationHelper(tbModule: string, maxTimeNs: number, dump: boolean, vcdName: string): string {
  const lines = ['`timescale 1ns/1ps', `module ${HELPER_MODULE};`];
  if (dump) lines.push(`  initial begin $dumpfile("${vcdName}"); $dumpvars(0, ${tbModule}); end`);
  lines.push(`  initial begin #${Math.max(1, Math.round(maxTimeNs))}; $display("${MAX_TIME_MARK} (${maxTimeNs} ns)."); $finish; end`);
  lines.push('endmodule', '');
  return lines.join('\n');
}

export async function simulateTestbench(
  projectDir: string,
  project: NanoLogicProject,
  testbench: string,
  opts: { maxTimeNs?: number; timeoutMs?: number; unsaved?: Record<string, string> } = {},
): Promise<SimulationResult> {
  const t0 = Date.now();
  const maxTimeNs = opts.maxTimeNs ?? project.simulation.maxTimeNs ?? TOOLCHAIN.simulation.defaultMaxTimeNs;
  const tbAbs = path.resolve(projectDir, testbench);
  const designAbs = project.designFiles.map((f) => path.resolve(projectDir, f)).filter((f) => f !== tbAbs);
  const staged = await stageSources(projectDir, [...designAbs, tbAbs], opts.unsaved);
  const tb = staged[staged.length - 1];
  const toDisplay = virtToDisplay(staged);

  const tbModules = scanModules(tb.text);
  const tbModule = tbModules.find(isTestbenchModule) ?? tbModules.find((m) => m.ports.length === 0);
  if (!tbModule) {
    return {
      ok: false,
      messages: [
        {
          severity: 'error',
          text: `No testbench module found in ${tb.display}. A testbench is a module with no ports and an initial block.`,
          file: tb.display,
          source: 'simulation',
        },
      ],
      endReason: 'compile-error',
      durationMs: Date.now() - t0,
    };
  }

  // Respect the testbench's own $dumpfile/$dumpvars if it has them.
  const allText = staged.map((s) => s.text).join('\n');
  const hasOwnDump = /\$dumpvars\b/.test(allText);
  const ownName = /\$dumpfile\s*\(\s*"([^"]+)"/.exec(allText)?.[1];
  const vcdName = hasOwnDump ? (ownName ?? 'dump.vcd') : TOOLCHAIN.simulation.vcdName;

  const files = [
    { path: TIMESCALE_FILE, text: '`timescale 1ns/1ns\n' },
    ...staged.map((s) => ({ path: s.virt, text: stopAsFinish(s.text) })),
  ];
  files.push({ path: HELPER_FILE, text: simulationHelper(tbModule.name, maxTimeNs, !hasOwnDump, vcdName) });

  const r = await iverilogSimulate(
    files,
    files.map((f) => f.path),
    [vcdName],
    opts.timeoutMs ?? TOOLCHAIN.simulation.timeoutMs,
  );

  const messages: Message[] = parseIverilogOutput(r.output, toDisplay, 'simulation', {
    runtime: r.stage === 'run',
    hidden: (line) => line.includes(HELPER_FILE) || line.includes(TIMESCALE_FILE),
  });
  let endReason: SimulationResult['endReason'];
  if (r.timedOut) {
    endReason = 'timeout';
    messages.push({
      severity: 'error',
      text: `Simulation was stopped after ${Math.round((opts.timeoutMs ?? TOOLCHAIN.simulation.timeoutMs) / 1000)} s of real time. Lower the maximum simulation time or check for a testbench that never ends.`,
      source: 'simulation',
    });
  } else if (!r.ok) {
    endReason = r.stage === 'run' ? 'error' : 'compile-error';
    if (!messages.some((m) => m.severity === 'error')) {
      messages.push({ severity: 'error', text: `Simulation failed during ${r.stage}.`, source: 'simulation' });
    }
  } else if (r.output.includes(MAX_TIME_MARK)) {
    endReason = 'max-time';
    for (const m of messages) if (m.text.startsWith(MAX_TIME_MARK)) m.severity = 'warning';
  } else {
    endReason = 'finished';
  }
  // Mention the $stop -> $finish behaviour on the line that called it.
  for (const m of messages) {
    if (/\$finish called at/.test(m.text) && m.file) {
      m.text = m.text.replace('$finish called', 'Simulation ended ($stop/$finish)');
    }
  }
  const vcd = r.artifacts[vcdName];
  if (r.ok && !vcd) {
    messages.push({ severity: 'warning', text: 'The simulation produced no waveform.', source: 'simulation' });
  }
  messages.push({
    severity: 'info',
    text: `Simulation of ${tbModule.name} ${endReason === 'finished' ? 'finished' : endReason === 'max-time' ? 'reached the maximum time' : 'did not complete'} in ${Date.now() - t0} ms.`,
    source: 'simulation',
  });
  return {
    ok: r.ok && !r.timedOut,
    messages,
    testbenchModule: tbModule.name,
    vcd,
    endReason,
    durationMs: Date.now() - t0,
  };
}
