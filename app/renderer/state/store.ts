// Minimal global store (no external library): one state object, immutable
// updates, and a selector hook built on useSyncExternalStore.
import { useSyncExternalStore } from 'react';
import type { BoardStartResult, BoardState, ExampleInfo, OpenedProject } from '@shared/api';
import type { Message } from '@shared/messages';
import type { SimNetInfo } from '@shared/netsim/compile';
import type { BoardWiringReport } from '@shared/netsim/boardEngine';
import type { AnalysisResult, TopPort } from '@shared/toolTypes';
import type { VcdData } from '@shared/vcd';

export type TaskId = 'analysis' | 'simulation' | 'board' | 'export';
export type TaskStatus = 'idle' | 'running' | 'passed' | 'failed';

export type Doc =
  | { id: 'welcome'; kind: 'welcome'; title: string }
  | { id: string; kind: 'editor'; title: string; path: string; rel: string; text: string; saved: string }
  | { id: string; kind: 'waveform'; title: string; vcd: VcdData; testbench: string }
  | { id: 'board'; kind: 'board'; title: string }
  | { id: 'pins'; kind: 'pins'; title: string };

export type DialogId = 'newProject' | 'import' | 'export' | 'simulate' | 'newFile' | 'about';

export interface BoardUiState {
  started: boolean;
  starting: boolean;
  state?: BoardState;
  nets: SimNetInfo[];
  report?: BoardWiringReport;
  inputs: { SW: number; KEY: number };
}

export interface AppState {
  project?: OpenedProject;
  docs: Doc[];
  active?: string;
  messages: Message[];
  tasks: Record<TaskId, TaskStatus>;
  analysis?: AnalysisResult;
  ports: TopPort[];
  statusText: string;
  rightPanelOpen: boolean;
  navigatorTab: 'hierarchy' | 'files';
  dialog?: DialogId;
  reveal?: { path: string; line: number; column?: number; nonce: number };
  recent: string[];
  examples: ExampleInfo[];
  board: BoardUiState;
  lastBoardStart?: BoardStartResult;
}

export const initialState: AppState = {
  docs: [{ id: 'welcome', kind: 'welcome', title: 'Home' }],
  active: 'welcome',
  messages: [],
  tasks: { analysis: 'idle', simulation: 'idle', board: 'idle', export: 'idle' },
  ports: [],
  statusText: 'Ready',
  rightPanelOpen: false,
  navigatorTab: 'files',
  recent: [],
  examples: [],
  board: { started: false, starting: false, nets: [], inputs: { SW: 0, KEY: 0b11 } },
};

type Listener = () => void;

class Store {
  private state: AppState = initialState;
  private listeners = new Set<Listener>();

  get = (): AppState => this.state;

  set = (update: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void => {
    const patch = typeof update === 'function' ? update(this.state) : update;
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  };

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

export const store = new Store();

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}

// Handy for tests and debugging from DevTools.
(globalThis as unknown as { __nanologicStore: Store }).__nanologicStore = store;
