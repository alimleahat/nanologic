// Everything the UI can do. Components call these; they talk to the main
// process through window.nanologic and update the store.
import type { ClockSpeed, ImportOptions, NewProjectOptions, OpenedProject } from '@shared/api';
import { getBoard } from '@shared/board';
import type { Message, MessageSource } from '@shared/messages';
import { autoMap, validatePins } from '@shared/pins';
import type { ExportLevel, NanoLogicProject } from '@shared/project';
import { store, type DialogId, type Doc, type TaskId, type TaskStatus } from './store';
import { parseVcdInWorker } from '../waveform/vcdClient';

const api = () => window.nanologic;

function joinPath(dir: string, rel: string): string {
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  const parts = [...dir.split(/[\\/]/), ...rel.split('/')];
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..' && out.length > 1) out.pop();
    else if (p !== '.') out.push(p);
  }
  return out.join(sep);
}

export function absPath(rel: string): string {
  const p = store.get().project;
  return p ? joinPath(p.dir, rel) : rel;
}

function setTask(id: TaskId, status: TaskStatus) {
  store.set((s) => ({ tasks: { ...s.tasks, [id]: status } }));
}

function setStatus(text: string) {
  store.set({ statusText: text });
}

export function replaceMessages(sources: MessageSource[], messages: Message[]) {
  store.set((s) => ({ messages: [...s.messages.filter((m) => !sources.includes(m.source)), ...messages] }));
}

export function reportError(source: MessageSource, e: unknown) {
  const text = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e);
  replaceMessages([source], [{ severity: 'error', text, source }]);
  setStatus(text);
}

export function openDialog(dialog: DialogId | undefined) {
  store.set({ dialog });
}

// ---------------------------------------------------------------------------
// Startup and projects

export async function loadStartupData() {
  const [recent, examples] = await Promise.all([api().getRecentProjects(), api().listExamples()]);
  store.set({ recent, examples });
}

async function setProject(opened: OpenedProject) {
  await closeProject(true);
  store.set((s) => ({
    project: opened,
    docs: s.docs.filter((d) => d.kind === 'welcome'),
    active: 'welcome',
    messages: [],
    analysis: undefined,
    ports: [],
    tasks: { analysis: 'idle', simulation: 'idle', board: 'idle', export: 'idle' },
    statusText: `Opened ${opened.project.name}`,
    navigatorTab: 'hierarchy',
  }));
  const top = opened.project.designFiles.find((f) => /\.s?v$/i.test(f) && f.split('/').pop()?.replace(/\.s?v$/i, '') === opened.project.topLevelEntity);
  if (top) await openFile(top);
  void loadStartupData();
  void runAnalysis();
}

export async function closeProject(silent = false) {
  const s = store.get();
  if (!s.project) return;
  const dirty = s.docs.some((d) => d.kind === 'editor' && d.text !== d.saved);
  if (dirty && !silent && !window.confirm('Some files have unsaved changes. Close the project anyway?')) return;
  if (s.board.started) api().boardStop();
  store.set({
    project: undefined,
    docs: [{ id: 'welcome', kind: 'welcome', title: 'Home' }],
    active: 'welcome',
    messages: [],
    analysis: undefined,
    ports: [],
    board: { started: false, starting: false, nets: [], inputs: { SW: 0, KEY: 0b11 } },
    statusText: 'Ready',
  });
}

export async function newProject(opts: NewProjectOptions) {
  // Standard DE10-Lite port names are mapped after the first analysis.
  await setProject(await api().newProject(opts));
}

export async function openProjectDialog() {
  try {
    const opened = await api().openProjectDialog();
    if (opened) await setProject(opened);
  } catch (e) {
    reportError('project', e);
  }
}

export async function openProjectPath(p: string) {
  try {
    await setProject(await api().openProject(p));
  } catch (e) {
    reportError('project', e);
  }
}

export async function importFolder(opts: ImportOptions) {
  await setProject(await api().importFolder(opts));
}

export async function openExample(id: string) {
  try {
    await setProject(await api().openExample(id));
  } catch (e) {
    reportError('project', e);
  }
}

/** Change the project settings and save the project file straight away. */
export async function updateProject(fn: (p: NanoLogicProject) => NanoLogicProject) {
  const s = store.get();
  if (!s.project) return;
  const project = fn(s.project.project);
  store.set({ project: { ...s.project, project } });
  try {
    await api().saveProject(s.project.path, project);
  } catch (e) {
    reportError('project', e);
  }
}

export async function addExistingFiles(kind: 'design' | 'testbench') {
  const s = store.get();
  if (!s.project) return;
  const files = await api().pickSourceFiles(s.project.dir);
  if (!files.length) return;
  await updateProject((p) =>
    kind === 'design'
      ? { ...p, designFiles: [...new Set([...p.designFiles, ...files])] }
      : { ...p, testbenchFiles: [...new Set([...p.testbenchFiles, ...files])] },
  );
}

export async function createNewFile(rel: string, kind: 'design' | 'testbench') {
  const s = store.get();
  if (!s.project) return;
  const name = rel.split('/').pop()!.replace(/\.s?v$/i, '');
  const text =
    kind === 'testbench'
      ? `\`timescale 1ns/1ps\n\nmodule ${name};\n\n    initial begin\n        // stimulus here\n        #100;\n        $stop;\n    end\n\nendmodule\n`
      : `module ${name} (\n    input  clk,\n    output out\n);\n\n    assign out = 1'b0;\n\nendmodule\n`;
  const created = await api().createSourceFile(s.project.dir, rel, text);
  await updateProject((p) =>
    kind === 'design' ? { ...p, designFiles: [...p.designFiles, created] } : { ...p, testbenchFiles: [...p.testbenchFiles, created] },
  );
  await openFile(created);
}

export async function removeFromProject(rel: string) {
  await updateProject((p) => ({
    ...p,
    designFiles: p.designFiles.filter((f) => f !== rel),
    testbenchFiles: p.testbenchFiles.filter((f) => f !== rel),
  }));
}

export async function setTopLevel(entity: string) {
  await updateProject((p) => ({ ...p, topLevelEntity: entity }));
  void runAnalysis();
}

// ---------------------------------------------------------------------------
// Documents

export function activate(id: string) {
  store.set({ active: id });
}

export function openSingleton(kind: 'board' | 'pins' | 'welcome') {
  const titles = { board: 'Virtual DE10-Lite', pins: 'Pin Assignments', welcome: 'Home' };
  store.set((s) => {
    if (s.docs.some((d) => d.id === kind)) return { active: kind };
    return { docs: [...s.docs, { id: kind, kind, title: titles[kind] } as Doc], active: kind };
  });
}

export async function openFile(rel: string, line?: number, column?: number) {
  const s = store.get();
  if (!s.project) return;
  const path = absPath(rel);
  const id = `file:${rel}`;
  if (!s.docs.some((d) => d.id === id)) {
    try {
      const text = await api().readFile(path);
      store.set((st) =>
        st.docs.some((d) => d.id === id)
          ? {}
          : { docs: [...st.docs, { id, kind: 'editor', title: rel.split('/').pop()!, path, rel, text, saved: text }] },
      );
    } catch (e) {
      reportError('project', e);
      return;
    }
  }
  store.set({ active: id, ...(line ? { reveal: { path, line, column, nonce: Date.now() } } : {}) });
}

export function updateDocText(id: string, text: string) {
  store.set((s) => ({ docs: s.docs.map((d) => (d.id === id && d.kind === 'editor' ? { ...d, text } : d)) }));
}

export async function saveDoc(id?: string) {
  const s = store.get();
  const doc = s.docs.find((d) => d.id === (id ?? s.active));
  if (!doc || doc.kind !== 'editor') return;
  try {
    await api().writeFile(doc.path, doc.text);
    store.set((st) => ({ docs: st.docs.map((d) => (d.id === doc.id && d.kind === 'editor' ? { ...d, saved: doc.text } : d)), statusText: `Saved ${doc.rel}` }));
  } catch (e) {
    reportError('project', e);
  }
}

export async function saveAll() {
  for (const d of store.get().docs) if (d.kind === 'editor' && d.text !== d.saved) await saveDoc(d.id);
}

export function closeDoc(id: string) {
  const s = store.get();
  const doc = s.docs.find((d) => d.id === id);
  if (!doc) return;
  if (doc.kind === 'editor' && doc.text !== doc.saved && !window.confirm(`${doc.title} has unsaved changes. Close it anyway?`)) return;
  if (doc.kind === 'board' && s.board.started) {
    api().boardStop();
    store.set((st) => ({ board: { ...st.board, started: false, state: undefined } }));
  }
  const idx = s.docs.findIndex((d) => d.id === id);
  const docs = s.docs.filter((d) => d.id !== id);
  const active = s.active === id ? docs[Math.min(idx, docs.length - 1)]?.id : s.active;
  store.set({ docs, active });
}

/** Unsaved editor contents by absolute path, so tools see what is on screen. */
function unsavedTexts(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of store.get().docs) if (d.kind === 'editor' && d.text !== d.saved) out[d.path] = d.text;
  return out;
}

// ---------------------------------------------------------------------------
// Processing

export async function runAnalysis() {
  const s = store.get();
  if (!s.project) return;
  setTask('analysis', 'running');
  setStatus('Analysis running...');
  try {
    const r = await api().analyse(s.project.dir, s.project.project, unsavedTexts());
    replaceMessages(['analysis'], r.messages);
    store.set({ analysis: r, ports: r.ports.length ? r.ports : store.get().ports });
    setTask('analysis', r.ok ? 'passed' : 'failed');
    const c = r.messages.filter((m) => m.severity === 'error').length;
    const w = r.messages.filter((m) => m.severity === 'warning').length;
    setStatus(`Analysis ${r.ok ? 'passed' : 'failed'}: ${c} error${c === 1 ? '' : 's'}, ${w} warning${w === 1 ? '' : 's'} (${(r.durationMs / 1000).toFixed(1)} s)`);
    // First analysis of a project: map standard port names automatically.
    const p = store.get().project?.project;
    if (r.ok && p && p.pinAssignments.length === 0) {
      const mapped = autoMap(r.ports, getBoard(p.boardId));
      if (mapped.length) await updateProject((pr) => ({ ...pr, pinAssignments: mapped }));
    }
  } catch (e) {
    setTask('analysis', 'failed');
    reportError('analysis', e);
  }
}

export async function runSimulation(testbench: string, maxTimeNs: number) {
  const s = store.get();
  if (!s.project) return;
  setTask('simulation', 'running');
  setStatus(`Simulating ${testbench}...`);
  await updateProject((p) => ({ ...p, simulation: { ...p.simulation, maxTimeNs, lastTestbench: testbench } }));
  try {
    const r = await api().simulate(s.project.dir, store.get().project!.project, testbench, maxTimeNs, unsavedTexts());
    replaceMessages(['simulation'], r.messages);
    setTask('simulation', r.ok ? 'passed' : 'failed');
    if (r.vcd) {
      setStatus('Loading waveform...');
      const vcd = await parseVcdInWorker(r.vcd);
      const id = `wave:${testbench}`;
      const title = `${r.testbenchModule ?? testbench} (waveform)`;
      store.set((st) => ({
        docs: st.docs.some((d) => d.id === id)
          ? st.docs.map((d) => (d.id === id ? { id, kind: 'waveform', title, vcd, testbench } : d))
          : [...st.docs, { id, kind: 'waveform', title, vcd, testbench }],
        active: id,
      }));
    }
    setStatus(`Simulation ${r.ok ? (r.endReason === 'max-time' ? 'stopped at the maximum time' : 'finished') : 'failed'} (${(r.durationMs / 1000).toFixed(1)} s)`);
  } catch (e) {
    setTask('simulation', 'failed');
    reportError('simulation', e);
  }
}

export async function startBoard() {
  const s = store.get();
  if (!s.project) return;
  openSingleton('board');
  setTask('board', 'running');
  store.set((st) => ({ board: { ...st.board, starting: true } }));
  setStatus('Building the design for the virtual board...');
  try {
    const r = await api().boardStart(s.project.dir, s.project.project, unsavedTexts());
    replaceMessages(['board'], r.messages);
    store.set((st) => ({
      board: { ...st.board, starting: false, started: r.ok, nets: r.nets, report: r.report },
      ports: r.ports.length ? r.ports : st.ports,
      lastBoardStart: r,
    }));
    setTask('board', r.ok ? 'passed' : 'failed');
    if (r.ok) {
      const b = store.get().board;
      api().boardSetInputs(b.inputs);
      setStatus('Virtual board running. Use the clock controls to start the clock.');
    } else setStatus('The virtual board could not start. See Messages.');
  } catch (e) {
    store.set((st) => ({ board: { ...st.board, starting: false, started: false } }));
    setTask('board', 'failed');
    reportError('board', e);
  }
}

export function setBoardInputs(inputs: Partial<{ SW: number; KEY: number }>) {
  store.set((s) => ({ board: { ...s.board, inputs: { ...s.board.inputs, ...inputs } } }));
  api().boardSetInputs(inputs);
}

export function setBoardClock(opts: { speed?: ClockSpeed; running?: boolean }) {
  api().boardSetClock(opts);
}

export function stepBoard(cycles = 1) {
  api().boardStep(cycles);
}

export function resetBoard() {
  api().boardReset();
}

export function subscribeBoardState(): () => void {
  return api().onBoardState((state) => store.set((s) => ({ board: { ...s.board, state } })));
}

export async function exportToQuartus(level: ExportLevel, dest: string) {
  const s = store.get();
  if (!s.project) return;
  setTask('export', 'running');
  setStatus('Exporting to Quartus...');
  try {
    await updateProject((p) => ({ ...p, exportLevel: level }));
    const r = await api().exportQuartus(s.project.dir, store.get().project!.project, level, dest);
    replaceMessages(['export'], r.messages);
    setTask('export', r.ok ? 'passed' : 'failed');
    setStatus(r.ok ? `Exported to ${r.folder}` : 'Export failed. See Messages.');
    return r;
  } catch (e) {
    setTask('export', 'failed');
    reportError('export', e);
  }
}

export function validateCurrentPins(): Message[] {
  const s = store.get();
  if (!s.project) return [];
  return validatePins(s.ports, s.project.project.pinAssignments, getBoard(s.project.project.boardId));
}
