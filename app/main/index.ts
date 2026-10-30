// Electron main process: window, menus and the IPC handlers behind window.nanologic.
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { BoardState, ExampleInfo, ImportOptions, NewProjectOptions, OpenedProject } from '../shared/api';
import { getBoard } from '../shared/board';
import type { Message } from '../shared/messages';
import { PROJECT_EXTENSION, type ExportLevel, type NanoLogicProject } from '../shared/project';
import { generateExport } from '../shared/quartusExport';
import type { AnalysisResult, SimulationResult } from '../shared/toolTypes';
import { copyTree, createNewProject, exists, importFolder, openProjectFile, RecentProjects, saveProjectFile, scanImport, writeFileAtomic } from './projectFs';
import { ToolClient, workerPath } from './toolClient';
import { toPosix } from './toolchain/sources';
import type { BoardNetlist } from './toolchain/boardNetlist';
import type { BoardWorkerMessage, BoardWorkerRequest } from './workers/boardWorker';

const isE2E = process.env.NANOLOGIC_E2E === '1';
if (process.env.NANOLOGIC_USER_DATA) app.setPath('userData', process.env.NANOLOGIC_USER_DATA);

/** Root of the app's own files (templates, examples, boards). */
const appRoot = () => app.getAppPath();
const recent = () => new RecentProjects(path.join(app.getPath('userData'), 'recent-projects.json'));
const tools = new ToolClient(workerPath('toolWorker'));

let mainWindow: BrowserWindow | undefined;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'NanoLogic',
    backgroundColor: '#ffffff',
    show: !isE2E || process.env.NANOLOGIC_SHOW === '1',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const devUrl = process.env.NANOLOGIC_DEV_URL;
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => {
    mainWindow = undefined;
    stopBoard();
  });
}

/** Native menu: only what the OS needs (the app's own menu bar is drawn in the window). */
function setNativeMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// Board worker

let boardWorker: Worker | undefined;
let boardLoadResolve: ((m: BoardWorkerMessage) => void) | undefined;

function ensureBoardWorker(): Worker {
  if (boardWorker) return boardWorker;
  boardWorker = new Worker(workerPath('boardWorker'));
  boardWorker.on('message', (m: BoardWorkerMessage) => {
    if (m.type === 'loaded') {
      boardLoadResolve?.(m);
      boardLoadResolve = undefined;
    } else if (m.type === 'state') {
      mainWindow?.webContents.send('board:state', m.state satisfies BoardState);
    }
  });
  boardWorker.on('exit', () => (boardWorker = undefined));
  return boardWorker;
}

function sendBoard(m: BoardWorkerRequest) {
  boardWorker?.postMessage(m);
}

function stopBoard() {
  sendBoard({ type: 'stop' });
}

// ---------------------------------------------------------------------------
// Examples

interface ExampleDef extends ExampleInfo {
  /** Folder to copy, relative to the app root. */
  sourceDir: string;
  /** Project file inside the copied folder, or a template to copy into it. */
  projectFile: string;
  projectTemplate?: string;
  destName: string;
}

const EXAMPLES: ExampleDef[] = [
  {
    id: 'starter',
    title: 'Starter: counter and switches',
    description: 'A 4-bit counter shown on HEX0; each switch lights the LED above it. KEY[0] resets the counter.',
    sourceDir: 'examples/starter-de10lite',
    projectFile: 'starter.nlproj',
    destName: 'starter-de10lite',
  },
  {
    id: 'traffic-light',
    title: 'Reference: traffic light controller',
    description: 'A 14-module traffic light with pedestrian button and countdown, with pins mapped for the DE10-Lite.',
    sourceDir: 'tests/fixtures/fpga-traffic-light-controller',
    projectFile: 'traffic_light.nlproj',
    projectTemplate: 'examples/traffic-light/traffic_light.nlproj',
    destName: 'traffic-light-controller',
  },
];

function defaultProjectsFolder(): string {
  return process.env.NANOLOGIC_PROJECTS_DIR ?? path.join(app.getPath('documents'), 'NanoLogic');
}

async function openExample(id: string): Promise<OpenedProject> {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) throw new Error(`Unknown example ${id}`);
  const dest = path.join(defaultProjectsFolder(), 'Examples', ex.destName);
  const projectPath = path.join(dest, ex.projectFile);
  if (!(await exists(projectPath))) {
    await copyTree(path.join(appRoot(), ex.sourceDir), dest);
    if (ex.projectTemplate) await fs.copyFile(path.join(appRoot(), ex.projectTemplate), projectPath);
  }
  const opened = await openProjectFile(projectPath);
  await recent().add(projectPath);
  return opened;
}

// ---------------------------------------------------------------------------
// Export

async function exportQuartus(projectDir: string, project: NanoLogicProject, level: ExportLevel, destFolder: string) {
  const messages: Message[] = [];
  const analysis = await tools.run<AnalysisResult>('analyse', [projectDir, project, {}]);
  if (!analysis.ok) {
    messages.push(...analysis.messages.filter((m) => m.severity === 'error'));
    if (level > 1) {
      messages.push({ severity: 'error', text: 'Export stopped: fix the analysis errors first (Processing > Start Analysis).', source: 'export' });
      return { ok: false, folder: '', files: [], messages };
    }
  }
  const sources = await Promise.all(
    project.designFiles.map(async (f) => ({ path: f, text: await fs.readFile(path.resolve(projectDir, f), 'utf8') })),
  );
  const out = generateExport({
    project,
    board: getBoard(project.boardId),
    ports: analysis.ports,
    sources,
    level,
    date: new Date(),
  });
  const folder = path.join(destFolder, out.folderName);
  await fs.mkdir(folder, { recursive: true });
  for (const f of out.files) await writeFileAtomic(path.join(folder, ...f.path.split('/')), f.content);
  messages.push(...out.messages);
  messages.push({ severity: 'info', text: `Exported ${out.files.length} files to ${folder}`, source: 'export' });
  return { ok: !messages.some((m) => m.severity === 'error'), folder, files: out.files.map((f) => f.path), messages };
}

// ---------------------------------------------------------------------------
// IPC

function relToProject(projectDir: string, abs: string): string {
  return toPosix(path.relative(projectDir, abs));
}

function registerIpc() {
  ipcMain.handle('app:versions', () => ({ app: app.getVersion(), electron: process.versions.electron }));
  ipcMain.handle('projects:recent', () => recent().list());
  ipcMain.handle('projects:defaultFolder', () => defaultProjectsFolder());
  ipcMain.handle('projects:new', async (_e, opts: NewProjectOptions) => {
    const template = await fs.readFile(path.join(appRoot(), 'templates/starter/top.v'), 'utf8');
    const opened = await createNewProject(opts, template);
    await recent().add(opened.path);
    return opened;
  });
  ipcMain.handle('projects:openDialog', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      title: 'Open Project',
      properties: ['openFile'],
      filters: [{ name: 'NanoLogic project', extensions: [PROJECT_EXTENSION.slice(1)] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const opened = await openProjectFile(r.filePaths[0]);
    await recent().add(opened.path);
    return opened;
  });
  ipcMain.handle('projects:open', async (_e, p: string) => {
    const opened = await openProjectFile(p);
    await recent().add(opened.path);
    return opened;
  });
  ipcMain.handle('projects:save', (_e, p: string, project: NanoLogicProject) => saveProjectFile(p, project));
  ipcMain.handle('dialog:chooseFolder', async (_e, title: string, defaultPath?: string) => {
    const r = await dialog.showOpenDialog(mainWindow!, { title, defaultPath, properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : (r.filePaths[0] ?? null);
  });
  ipcMain.handle('projects:scanImport', (_e, folder: string) => scanImport(folder));
  ipcMain.handle('projects:import', async (_e, opts: ImportOptions) => {
    const opened = await importFolder(opts);
    await recent().add(opened.path);
    return opened;
  });
  ipcMain.handle('examples:list', () => EXAMPLES.map(({ id, title, description }) => ({ id, title, description })));
  ipcMain.handle('examples:open', (_e, id: string) => openExample(id));

  ipcMain.handle('fs:read', (_e, p: string) => fs.readFile(p, 'utf8'));
  ipcMain.handle('fs:write', (_e, p: string, text: string) => writeFileAtomic(p, text));
  ipcMain.handle('fs:createSource', async (_e, projectDir: string, rel: string, text: string) => {
    const abs = path.resolve(projectDir, rel);
    if (await exists(abs)) throw new Error(`${rel} already exists`);
    await writeFileAtomic(abs, text);
    return relToProject(projectDir, abs);
  });
  ipcMain.handle('fs:pickSources', async (_e, projectDir: string) => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      title: 'Add Files to Project',
      defaultPath: projectDir,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Verilog', extensions: ['v', 'sv'] }],
    });
    return r.canceled ? [] : r.filePaths.map((f) => relToProject(projectDir, f));
  });

  ipcMain.handle('tools:analyse', (_e, dir: string, project: NanoLogicProject, unsaved: Record<string, string>) =>
    tools.run<AnalysisResult>('analyse', [dir, project, unsaved]),
  );
  ipcMain.handle(
    'tools:simulate',
    (_e, dir: string, project: NanoLogicProject, tb: string, maxTimeNs: number, unsaved: Record<string, string>) =>
      tools.run<SimulationResult>('simulate', [dir, project, tb, { maxTimeNs, unsaved }]),
  );

  ipcMain.handle('board:start', async (_e, dir: string, project: NanoLogicProject, unsaved: Record<string, string>) => {
    const net = await tools.run<BoardNetlist>('boardNetlist', [dir, project, unsaved]);
    if (!net.ok || !net.design) return { ok: false, messages: net.messages, ports: [], nets: [] };
    const w = ensureBoardWorker();
    const loaded = await new Promise<BoardWorkerMessage>((resolve) => {
      boardLoadResolve = resolve;
      w.postMessage({
        type: 'load',
        design: net.design!,
        top: project.topLevelEntity,
        boardId: project.boardId,
        ports: net.ports,
        assignments: project.pinAssignments,
        tieOffs: project.virtualBoard.tieOffs,
        bypass: project.virtualBoard.bypass,
      } satisfies BoardWorkerRequest);
    });
    if (loaded.type !== 'loaded' || !loaded.ok) {
      const err = loaded.type === 'loaded' && !loaded.ok ? loaded : undefined;
      return {
        ok: false,
        messages: [{ severity: 'error', text: err?.error ?? 'Board failed to start', file: err?.file, line: err?.line, source: 'board' }],
        ports: net.ports,
        nets: [],
      };
    }
    return { ok: true, messages: net.messages, ports: net.ports, nets: loaded.nets, report: loaded.report };
  });
  ipcMain.on('board:inputs', (_e, inputs: { SW?: number; KEY?: number }) => sendBoard({ type: 'inputs', ...inputs }));
  ipcMain.on('board:clock', (_e, opts) => sendBoard({ type: 'clock', ...opts }));
  ipcMain.on('board:step', (_e, cycles: number) => sendBoard({ type: 'step', cycles }));
  ipcMain.on('board:reset', () => sendBoard({ type: 'reset' }));
  ipcMain.on('board:stop', () => stopBoard());

  ipcMain.handle('export:quartus', (_e, dir: string, project: NanoLogicProject, level: ExportLevel, dest: string) =>
    exportQuartus(dir, project, level, dest),
  );
  ipcMain.on('shell:showInFolder', (_e, p: string) => shell.showItemInFolder(p));
}

app.whenReady().then(() => {
  setNativeMenu();
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  tools.dispose();
  void boardWorker?.terminate();
  if (process.platform !== 'darwin' || isE2E) app.quit();
});
