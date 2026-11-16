// Worker thread for analysis, simulation and netlist builds, so the
// WebAssembly toolchain never blocks the Electron main process.
import { parentPort } from 'node:worker_threads';
import { analyseProject } from '../toolchain/analysis';
import { buildBoardNetlist } from '../toolchain/boardNetlist';
import { simulateTestbench } from '../toolchain/simulation';

export type ToolRequest =
  | { id: number; kind: 'analyse'; args: Parameters<typeof analyseProject> }
  | { id: number; kind: 'simulate'; args: Parameters<typeof simulateTestbench> }
  | { id: number; kind: 'boardNetlist'; args: Parameters<typeof buildBoardNetlist> };

export type ToolResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

parentPort?.on('message', async (req: ToolRequest) => {
  try {
    let result: unknown;
    if (req.kind === 'analyse') result = await analyseProject(req.args[0], req.args[1], req.args[2]);
    else if (req.kind === 'simulate') result = await simulateTestbench(...req.args);
    else result = await buildBoardNetlist(req.args[0], req.args[1], req.args[2]);
    parentPort!.postMessage({ id: req.id, ok: true, result } satisfies ToolResponse);
  } catch (e) {
    parentPort!.postMessage({ id: req.id, ok: false, error: (e as Error).stack ?? String(e) } satisfies ToolResponse);
  }
});
