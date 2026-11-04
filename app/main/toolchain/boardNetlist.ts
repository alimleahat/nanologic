// Builds the flattened netlist that the virtual board runs.
import path from 'node:path';
import type { Message } from '../../shared/messages';
import { virtualBoardYosysScript } from '../../shared/netsim/compile';
import type { YosysDesign } from '../../shared/netsim/yosysJson';
import type { NanoLogicProject } from '../../shared/project';
import type { TopPort } from '../../shared/toolTypes';
import { portsFromYosys } from './analysis';
import { parseYosysLog } from './parseOutput';
import { stageSources, virtToDisplay } from './sources';
import { runYosysCommands, yosysQuote } from './yosys';

export interface BoardNetlist {
  ok: boolean;
  messages: Message[];
  design?: YosysDesign;
  ports: TopPort[];
}

export async function buildBoardNetlist(
  projectDir: string,
  project: NanoLogicProject,
  unsaved: Record<string, string> = {},
  runYosys = runYosysCommands,
): Promise<BoardNetlist> {
  const files = project.designFiles.map((f) => path.resolve(projectDir, f));
  const staged = await stageSources(projectDir, files, unsaved);
  const toDisplay = virtToDisplay(staged);
  const r = await runYosys(
    Object.fromEntries(staged.map((s) => [s.virt, s.text])),
    [
      `read_verilog ${staged.map((s) => yosysQuote(s.virt)).join(' ')}`,
      ...virtualBoardYosysScript(project.topLevelEntity),
      'write_json nl_board.json',
    ],
    ['nl_board.json'],
  );
  const messages = parseYosysLog(
    r.log,
    staged.map((s) => s.virt),
    toDisplay,
    'board',
  ).filter((m) => m.severity === 'error');
  if (!r.ok || !r.outputs['nl_board.json']) {
    if (messages.length === 0) messages.push({ severity: 'error', text: 'Could not build the design for the virtual board. Run Analysis for details.', source: 'board' });
    return { ok: false, messages, ports: [] };
  }
  const design = JSON.parse(r.outputs['nl_board.json']) as YosysDesign;
  return { ok: true, messages, design, ports: portsFromYosys(design, project.topLevelEntity) };
}
