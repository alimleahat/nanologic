// Runs Yosys (YoWASP WebAssembly build) on an in-memory set of files.
import { stripAnsi } from '../../shared/messages';

export interface YosysRunResult {
  ok: boolean;
  exitCode: number;
  log: string;
  outputs: Record<string, string>;
}

type YosysModule = typeof import('@yowasp/yosys');
let modPromise: Promise<YosysModule> | undefined;

function loadYosys(): Promise<YosysModule> {
  modPromise ??= import('@yowasp/yosys');
  return modPromise;
}

/** Quote a file name for a Yosys script command. */
export function yosysQuote(s: string): string {
  return /^[A-Za-z0-9_./-]+$/.test(s) ? s : `"${s.replace(/"/g, '\\"')}"`;
}

/**
 * Run `commands` in Yosys with `files` (virtual path -> text) available in the
 * working directory. Returns the log and the requested output files.
 */
export async function runYosysCommands(
  files: Record<string, string>,
  commands: string[],
  outputNames: string[] = [],
): Promise<YosysRunResult> {
  const { runYosys } = await loadYosys();
  let log = '';
  const decoder = new TextDecoder();
  const sink = (bytes: Uint8Array | null) => {
    if (bytes) log += decoder.decode(bytes, { stream: true });
  };
  // YoWASP takes a nested directory tree.
  type Tree = { [name: string]: Tree | string };
  const tree: Tree = {};
  for (const [p, text] of Object.entries(files)) {
    const parts = p.split('/');
    let dir = tree;
    for (const seg of parts.slice(0, -1)) dir = (dir[seg] ??= {}) as Tree;
    dir[parts[parts.length - 1]] = text;
  }
  const script = commands.join('; ');
  const decode = (v: unknown): string | undefined =>
    typeof v === 'string' ? v : v instanceof Uint8Array ? new TextDecoder().decode(v) : undefined;
  try {
    const result = (await runYosys(['-q', '-p', script], tree, {
      stdout: sink,
      stderr: sink,
      decodeASCII: false,
      // No progress output: resources are read from local disk.
      fetchProgress: () => {},
    })) as Record<string, unknown> | undefined;
    const outputs: Record<string, string> = {};
    for (const name of outputNames) {
      const v = decode(result?.[name]);
      if (v !== undefined) outputs[name] = v;
    }
    return { ok: true, exitCode: 0, log: stripAnsi(log), outputs };
  } catch (e) {
    const err = e as { code?: number; message?: string };
    if (typeof err.code === 'number') {
      return { ok: false, exitCode: err.code, log: stripAnsi(log), outputs: {} };
    }
    throw e;
  }
}
