// Writes a generated Quartus export to disk.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ExportFile } from '../shared/quartusExport';
import { writeFileAtomic } from './projectFs';

/**
 * Write export files under `folder`. Paths inside the export always use forward
 * slashes (Quartus reads them on Windows too); they are converted to the local
 * separator only for writing. Stale .v files from an earlier export are removed
 * from src/ so Quartus does not see files that are no longer in the project.
 */
export async function writeExport(folder: string, files: ExportFile[]): Promise<string[]> {
  await fs.mkdir(folder, { recursive: true });
  const srcDir = path.join(folder, 'src');
  const keep = new Set(files.filter((f) => f.path.startsWith('src/')).map((f) => f.path.slice(4)));
  try {
    for (const name of await fs.readdir(srcDir)) {
      if (/\.s?v$/i.test(name) && !keep.has(name)) await fs.rm(path.join(srcDir, name));
    }
  } catch {
    // no previous export
  }
  const written: string[] = [];
  for (const f of files) {
    const abs = path.join(folder, ...f.path.split('/'));
    await writeFileAtomic(abs, f.content);
    written.push(abs);
  }
  return written;
}
