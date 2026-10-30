// Project files on disk: create, open, save, import and recent projects.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ImportOptions, ImportScan, NewProjectOptions, OpenedProject } from '../shared/api';
import { classifyImport } from '../shared/importScan';
import { createProject, isValidName, parseProject, PROJECT_EXTENSION, serializeProject, type NanoLogicProject } from '../shared/project';
import { toPosix } from './toolchain/sources';

const MAX_RECENT = 10;
const SKIP_DIRS = new Set(['node_modules', '.git', 'db', 'incremental_db', 'output_files', 'simulation', 'work', '.nanologic']);

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function openProjectFile(projectPath: string): Promise<OpenedProject> {
  const text = await fs.readFile(projectPath, 'utf8');
  const project = parseProject(text);
  return { path: projectPath, dir: path.dirname(projectPath), project };
}

export async function saveProjectFile(projectPath: string, project: NanoLogicProject): Promise<void> {
  await writeFileAtomic(projectPath, serializeProject(project));
}

export async function writeFileAtomic(file: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, text, 'utf8');
  await fs.rename(tmp, file);
}

export function starterTopLevel(template: string, top: string): string {
  return template.replace(/\{\{TOP\}\}/g, top);
}

export async function createNewProject(opts: NewProjectOptions, starterTemplate: string): Promise<OpenedProject> {
  if (!isValidName(opts.name)) throw new Error('Project names may only use letters, digits and _, and must not start with a digit.');
  if (!isValidName(opts.topLevelEntity)) throw new Error('The top-level entity must be a valid Verilog identifier.');
  const dir = path.join(opts.folder, opts.name);
  const projectPath = path.join(dir, `${opts.name}${PROJECT_EXTENSION}`);
  if (await exists(projectPath)) throw new Error(`A project already exists at ${projectPath}`);
  const topFile = `${opts.topLevelEntity}.v`;
  await fs.mkdir(dir, { recursive: true });
  if (!(await exists(path.join(dir, topFile)))) {
    await fs.writeFile(path.join(dir, topFile), starterTopLevel(starterTemplate, opts.topLevelEntity), 'utf8');
  }
  const project = createProject({
    name: opts.name,
    boardId: opts.boardId,
    topLevelEntity: opts.topLevelEntity,
    designFiles: [topFile],
  });
  await saveProjectFile(projectPath, project);
  return { path: projectPath, dir, project };
}

export async function listVerilogFiles(folder: string, base = folder, depth = 0): Promise<string[]> {
  if (depth > 8) return [];
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const abs = path.join(folder, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) out.push(...(await listVerilogFiles(abs, base, depth + 1)));
    } else if (/\.(v|sv|vh)$/i.test(e.name)) {
      out.push(toPosix(path.relative(base, abs)));
    }
  }
  return out.sort();
}

export async function scanImport(folder: string): Promise<ImportScan> {
  const files = await listVerilogFiles(folder);
  const withText = await Promise.all(
    files.filter((f) => !/\.vh$/i.test(f)).map(async (p) => ({ path: p, text: await fs.readFile(path.join(folder, p), 'utf8') })),
  );
  return { folder, ...classifyImport(withText) };
}

/**
 * Create a project for an existing folder of Verilog files. The sources are
 * referenced where they are, never modified; only the .nlproj file is written.
 */
export async function importFolder(opts: ImportOptions): Promise<OpenedProject> {
  if (!isValidName(opts.name)) throw new Error('Project names may only use letters, digits and _.');
  const projectDir = opts.projectFolder ?? opts.folder;
  const projectPath = path.join(projectDir, `${opts.name}${PROJECT_EXTENSION}`);
  if (await exists(projectPath)) throw new Error(`A project already exists at ${projectPath}`);
  const rel = (f: string) => toPosix(path.relative(projectDir, path.join(opts.folder, f)));
  const project = createProject({
    name: opts.name,
    topLevelEntity: opts.topLevelEntity,
    designFiles: opts.designFiles.map(rel),
    testbenchFiles: opts.testbenchFiles.map(rel),
  });
  await saveProjectFile(projectPath, project);
  return { path: projectPath, dir: projectDir, project };
}

export class RecentProjects {
  constructor(private readonly file: string) {}

  async list(): Promise<string[]> {
    try {
      const list = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (!Array.isArray(list)) return [];
      const present = await Promise.all(list.map(async (p: string) => ((await exists(p)) ? p : null)));
      return present.filter((p): p is string => !!p);
    } catch {
      return [];
    }
  }

  async add(projectPath: string): Promise<void> {
    const list = (await this.list()).filter((p) => path.resolve(p) !== path.resolve(projectPath));
    list.unshift(projectPath);
    await writeFileAtomic(this.file, JSON.stringify(list.slice(0, MAX_RECENT), null, 2));
  }
}

/** Copy a folder tree (used to give the user an editable copy of an example). */
export async function copyTree(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyTree(s, d);
    else await fs.copyFile(s, d);
  }
}
