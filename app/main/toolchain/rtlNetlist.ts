// Builds the RTL Viewer's netlist with the bundled Yosys (hierarchy kept).
import path from 'node:path';
import type { YosysDesign } from '../../shared/netsim/yosysJson';
import type { NanoLogicProject } from '../../shared/project';
import { buildRtlNetlist, GATE_MAP_FILE, GATE_MAP_VERILOG, rtlYosysScript, type RtlMode, type RtlNetlistResult } from '../../shared/rtl/netlist';
import { parseYosysLog } from './parseOutput';
import { stageSources, virtToDisplay } from './sources';
import { runYosysCommands, yosysQuote } from './yosys';

export async function buildRtlView(
  projectDir: string,
  project: NanoLogicProject,
  mode: RtlMode,
  unsaved: Record<string, string> = {},
  runYosys = runYosysCommands,
): Promise<RtlNetlistResult> {
  const t0 = Date.now();
  if (project.designFiles.length === 0) {
    return { ok: false, messages: [{ severity: 'error', text: 'The project has no design files.', source: 'rtl' }], durationMs: 0 };
  }
  const files = project.designFiles.map((f) => path.resolve(projectDir, f));
  const staged = await stageSources(projectDir, files, unsaved);
  const toDisplay = virtToDisplay(staged);
  const fileMap: Record<string, string> = Object.fromEntries(staged.map((s) => [s.virt, s.text]));
  if (mode === 'gates') fileMap[GATE_MAP_FILE] = GATE_MAP_VERILOG;
  const r = await runYosys(
    fileMap,
    [`read_verilog ${staged.map((s) => yosysQuote(s.virt)).join(' ')}`, ...rtlYosysScript(project.topLevelEntity, mode), 'write_json nl_rtl.json'],
    ['nl_rtl.json'],
  );
  const messages = parseYosysLog(
    r.log,
    staged.map((s) => s.virt),
    toDisplay,
    'rtl',
  ).filter((m) => m.severity === 'error');
  if (!r.ok || !r.outputs['nl_rtl.json']) {
    if (messages.length === 0) {
      messages.push({ severity: 'error', text: 'The RTL Viewer could not build the netlist. Run Analysis for details.', source: 'rtl' });
    }
    return { ok: false, messages, durationMs: Date.now() - t0 };
  }
  const design = JSON.parse(r.outputs['nl_rtl.json']) as YosysDesign;
  const netlist = buildRtlNetlist(design, project.topLevelEntity, mode, toDisplay);
  return { ok: true, messages, netlist, durationMs: Date.now() - t0 };
}
