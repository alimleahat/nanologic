// The API the preload script exposes to the renderer as `window.nanologic`.
import type { ImportClassification } from './importScan';
import type { BoardOutputLevels, BoardWiringReport } from './netsim/boardEngine';
import type { SimNetInfo } from './netsim/compile';
import type { Message } from './messages';
import type { ExportLevel, NanoLogicProject } from './project';
import type { AnalysisResult, SimulationResult, TopPort } from './toolTypes';

export interface OpenedProject {
  /** Absolute path of the .nlproj file. */
  path: string;
  /** Folder containing the project file. */
  dir: string;
  project: NanoLogicProject;
}

export interface NewProjectOptions {
  name: string;
  /** Parent folder; the project is created in <folder>/<name>. */
  folder: string;
  topLevelEntity: string;
  boardId: string;
}

export interface ImportScan extends ImportClassification {
  folder: string;
}

export interface ImportOptions {
  folder: string;
  name: string;
  topLevelEntity: string;
  designFiles: string[];
  testbenchFiles: string[];
  /** Where to write the .nlproj; defaults to `folder`. */
  projectFolder?: string;
}

export type ClockSpeed = 1 | 10 | 1000 | 'max';

export interface BoardStartResult {
  ok: boolean;
  messages: Message[];
  ports: TopPort[];
  nets: SimNetInfo[];
  report?: BoardWiringReport;
}

export interface BoardState {
  outputs: BoardOutputLevels;
  cycles: number;
  running: boolean;
  speed: ClockSpeed;
  /** Measured clock cycles per second over the last interval. */
  actualHz: number;
  error?: string;
}

export interface ExportResult {
  ok: boolean;
  folder: string;
  files: string[];
  messages: Message[];
}

export interface ExampleInfo {
  id: string;
  title: string;
  description: string;
}

export interface NanoLogicApi {
  platform: string;
  versions: { app: string; electron: string };

  getRecentProjects(): Promise<string[]>;
  newProject(opts: NewProjectOptions): Promise<OpenedProject>;
  openProjectDialog(): Promise<OpenedProject | null>;
  openProject(projectPath: string): Promise<OpenedProject>;
  saveProject(projectPath: string, project: NanoLogicProject): Promise<void>;
  chooseFolder(title: string, defaultPath?: string): Promise<string | null>;
  defaultProjectsFolder(): Promise<string>;
  scanImportFolder(folder: string): Promise<ImportScan>;
  importFolder(opts: ImportOptions): Promise<OpenedProject>;
  listExamples(): Promise<ExampleInfo[]>;
  openExample(id: string): Promise<OpenedProject>;

  readFile(absPath: string): Promise<string>;
  writeFile(absPath: string, text: string): Promise<void>;
  /** Create a new Verilog file in the project folder; returns its project-relative path. */
  createSourceFile(projectDir: string, relPath: string, text: string): Promise<string>;
  /** Let the user pick existing Verilog files; returns project-relative paths. */
  pickSourceFiles(projectDir: string): Promise<string[]>;

  analyse(projectDir: string, project: NanoLogicProject, unsaved: Record<string, string>): Promise<AnalysisResult>;
  simulate(
    projectDir: string,
    project: NanoLogicProject,
    testbench: string,
    maxTimeNs: number,
    unsaved: Record<string, string>,
  ): Promise<SimulationResult>;

  boardStart(projectDir: string, project: NanoLogicProject, unsaved: Record<string, string>): Promise<BoardStartResult>;
  boardSetInputs(inputs: { SW?: number; KEY?: number }): void;
  boardSetClock(opts: { speed?: ClockSpeed; running?: boolean }): void;
  boardStep(cycles: number): void;
  boardReset(): void;
  boardStop(): void;
  onBoardState(cb: (state: BoardState) => void): () => void;

  exportQuartus(projectDir: string, project: NanoLogicProject, level: ExportLevel, destFolder: string): Promise<ExportResult>;
  showInFolder(absPath: string): void;

  /** Menu commands sent from the native menu (macOS) to the renderer. */
  onMenuCommand(cb: (command: string) => void): () => void;
}

declare global {
  interface Window {
    nanologic: NanoLogicApi;
  }
}
