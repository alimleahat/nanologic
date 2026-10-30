// Classify the Verilog files of an existing folder into design files and
// testbenches, and suggest a top-level module.
import { findTopCandidates, isTestbenchFile, scanModules, type ScannedModule } from './verilogScan';

export interface ImportFile {
  /** Path relative to the imported folder, forward slashes. */
  path: string;
  text: string;
}

export interface ImportClassification {
  designFiles: string[];
  testbenchFiles: string[];
  /** Candidate top-level modules, best first. */
  topCandidates: string[];
  modules: { name: string; file: string }[];
}

export function classifyImport(files: ImportFile[], preferredTop?: string): ImportClassification {
  const designFiles: string[] = [];
  const testbenchFiles: string[] = [];
  const designModules: ScannedModule[] = [];
  const modules: { name: string; file: string }[] = [];
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const mods = scanModules(f.text);
    mods.forEach((m) => modules.push({ name: m.name, file: f.path }));
    if (isTestbenchFile(f.path, mods)) testbenchFiles.push(f.path);
    else {
      designFiles.push(f.path);
      designModules.push(...mods);
    }
  }
  const candidates = findTopCandidates(designModules);
  // Rank: preferred name, then modules whose subtree is largest.
  const byName = new Map(designModules.map((m) => [m.name, m]));
  const size = (name: string, seen = new Set<string>()): number => {
    const m = byName.get(name);
    if (!m || seen.has(name)) return 0;
    seen.add(name);
    return 1 + m.instances.reduce((s, i) => s + size(i.moduleName, seen), 0);
  };
  candidates.sort((a, b) => {
    if (a === preferredTop) return -1;
    if (b === preferredTop) return 1;
    return size(b) - size(a) || a.localeCompare(b);
  });
  return { designFiles, testbenchFiles, topCandidates: candidates, modules };
}
