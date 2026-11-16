// Runs Icarus Verilog (WebAssembly build) on staged sources.
import { TOOLCHAIN } from './config';

type IverilogModule = typeof import('@veriflow/iverilog-wasm');
let modPromise: Promise<IverilogModule> | undefined;

function loadIverilog(): Promise<IverilogModule> {
  modPromise ??= import('@veriflow/iverilog-wasm');
  return modPromise;
}

export interface IverilogFile {
  path: string;
  text: string;
}

export interface IverilogRunResult {
  ok: boolean;
  stage: 'preprocess' | 'compile' | 'run';
  output: string;
  artifacts: Record<string, Uint8Array>;
  timedOut: boolean;
  durationMs: number;
}

/**
 * Make `$stop` end the simulation. Native vvp is run with -n for this; the
 * WebAssembly vvp has no such switch, and at `$stop` it reads an empty stdin and
 * continues, so free-running clocks would never end. Replacing the token keeps
 * line numbers unchanged.
 */
export function stopAsFinish(text: string): string {
  return text.replace(/\$stop\b/g, '$finish');
}

export async function iverilogCompileOnly(
  files: IverilogFile[],
  sources: string[],
  top: string | undefined,
): Promise<IverilogRunResult> {
  const { compile } = await loadIverilog();
  const t0 = Date.now();
  try {
    const r = await compile({
      files: files.map((f) => ({ path: f.path, data: f.text })),
      sources,
      top,
      generation: TOOLCHAIN.iverilog.generation,
      timeoutMs: TOOLCHAIN.analysis.timeoutMs,
    });
    return {
      ok: r.success,
      stage: r.stage,
      output: r.combinedOutput,
      artifacts: {},
      timedOut: false,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    return failure(e, 'compile', t0);
  }
}

export async function iverilogSimulate(
  files: IverilogFile[],
  sources: string[],
  artifacts: string[],
  timeoutMs: number,
): Promise<IverilogRunResult> {
  const { simulate } = await loadIverilog();
  const t0 = Date.now();
  try {
    const r = await simulate({
      files: files.map((f) => ({ path: f.path, data: f.text })),
      sources,
      generation: TOOLCHAIN.iverilog.generation,
      artifacts,
      timeoutMs,
    });
    const out: Record<string, Uint8Array> = {};
    for (const [k, v] of r.artifacts) out[k] = v;
    return { ok: r.success, stage: r.stage, output: r.combinedOutput, artifacts: out, timedOut: false, durationMs: Date.now() - t0 };
  } catch (e) {
    return failure(e, 'run', t0);
  }
}

function failure(e: unknown, stage: 'compile' | 'run', t0: number): IverilogRunResult {
  const err = e as { code?: string; message?: string };
  const timedOut = err.code === 'TIMEOUT';
  return {
    ok: false,
    stage,
    output: timedOut ? '' : `Toolchain error: ${err.message ?? String(e)}`,
    artifacts: {},
    timedOut,
    durationMs: Date.now() - t0,
  };
}
