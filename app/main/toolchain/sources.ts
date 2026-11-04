import fs from 'node:fs/promises';
import path from 'node:path';

/** A source file staged into a toolchain's in-memory workspace. */
export interface StagedSource {
  /** Absolute path on disk. */
  abs: string;
  /** Path inside the tool's virtual workspace (forward slashes, no spaces or ".."). */
  virt: string;
  /** Path shown to the user: relative to the project folder, forward slashes. */
  display: string;
  text: string;
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/** Project-relative display path for an absolute file. */
export function displayPath(projectDir: string, abs: string): string {
  return toPosix(path.relative(projectDir, abs)) || path.basename(abs);
}

function safeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9_.-]/g, '_');
}

/**
 * Stage files for a WebAssembly tool. Virtual paths keep the directory layout
 * (so messages stay readable) but never contain "..", spaces or drive letters.
 * `overrides` supplies unsaved editor contents keyed by absolute path.
 */
export async function stageSources(
  projectDir: string,
  files: string[],
  overrides: Record<string, string> = {},
): Promise<StagedSource[]> {
  const used = new Set<string>();
  const out: StagedSource[] = [];
  for (const abs of files) {
    const display = displayPath(projectDir, abs);
    const parts = display.split('/').map((seg) => (seg === '..' ? 'up' : safeSegment(seg)));
    let virt = parts.join('/');
    let n = 1;
    while (used.has(virt)) virt = `${parts.slice(0, -1).concat(`${n++}_${parts[parts.length - 1]}`).join('/')}`;
    used.add(virt);
    const text = overrides[abs] ?? (await fs.readFile(abs, 'utf8'));
    out.push({ abs, virt, display, text });
  }
  return out;
}

/** Replace virtual paths in tool output with the user-facing display paths. */
export function virtToDisplay(sources: StagedSource[]): (file: string) => string {
  const map = new Map(sources.map((s) => [s.virt, s.display]));
  return (file: string) => map.get(file) ?? map.get(file.replace(/^\.\//, '')) ?? file;
}
