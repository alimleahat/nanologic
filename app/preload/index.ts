// Preload: exposes a narrow, typed API to the renderer. No Node access leaks through.
import { contextBridge, ipcRenderer } from 'electron';
import type { BoardState, NanoLogicApi } from '../shared/api';

let versions = { app: '', electron: process.versions.electron ?? '' };
void ipcRenderer.invoke('app:versions').then((v) => (versions = v));

const api: NanoLogicApi = {
  platform: process.platform,
  get versions() {
    return versions;
  },
  getRecentProjects: () => ipcRenderer.invoke('projects:recent'),
  newProject: (opts) => ipcRenderer.invoke('projects:new', opts),
  openProjectDialog: () => ipcRenderer.invoke('projects:openDialog'),
  openProject: (p) => ipcRenderer.invoke('projects:open', p),
  saveProject: (p, project) => ipcRenderer.invoke('projects:save', p, project),
  chooseFolder: (title, defaultPath) => ipcRenderer.invoke('dialog:chooseFolder', title, defaultPath),
  defaultProjectsFolder: () => ipcRenderer.invoke('projects:defaultFolder'),
  scanImportFolder: (folder) => ipcRenderer.invoke('projects:scanImport', folder),
  importFolder: (opts) => ipcRenderer.invoke('projects:import', opts),
  listExamples: () => ipcRenderer.invoke('examples:list'),
  openExample: (id) => ipcRenderer.invoke('examples:open', id),
  readFile: (p) => ipcRenderer.invoke('fs:read', p),
  writeFile: (p, text) => ipcRenderer.invoke('fs:write', p, text),
  createSourceFile: (dir, rel, text) => ipcRenderer.invoke('fs:createSource', dir, rel, text),
  pickSourceFiles: (dir) => ipcRenderer.invoke('fs:pickSources', dir),
  analyse: (dir, project, unsaved) => ipcRenderer.invoke('tools:analyse', dir, project, unsaved),
  simulate: (dir, project, tb, maxTimeNs, unsaved) => ipcRenderer.invoke('tools:simulate', dir, project, tb, maxTimeNs, unsaved),
  boardStart: (dir, project, unsaved) => ipcRenderer.invoke('board:start', dir, project, unsaved),
  boardSetInputs: (inputs) => ipcRenderer.send('board:inputs', inputs),
  boardSetClock: (opts) => ipcRenderer.send('board:clock', opts),
  boardStep: (cycles) => ipcRenderer.send('board:step', cycles),
  boardReset: () => ipcRenderer.send('board:reset'),
  boardStop: () => ipcRenderer.send('board:stop'),
  onBoardState: (cb) => {
    const h = (_e: unknown, s: BoardState) => cb(s);
    ipcRenderer.on('board:state', h);
    return () => ipcRenderer.removeListener('board:state', h);
  },
  exportProject: (dir, project, level, dest) => ipcRenderer.invoke('export:project', dir, project, level, dest),
  showInFolder: (p) => ipcRenderer.send('shell:showInFolder', p),
  onMenuCommand: (cb) => {
    const h = (_e: unknown, c: string) => cb(c);
    ipcRenderer.on('menu:command', h);
    return () => ipcRenderer.removeListener('menu:command', h);
  },
};

contextBridge.exposeInMainWorld('nanologic', api);
