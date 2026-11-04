// The NanoLogic project file (<name>.nlproj), stored as JSON next to the sources.

export interface PinAssignment {
  /** Top-level port name. */
  port: string;
  /** Declared bit index for bus ports, null for scalar ports. */
  bit: number | null;
  /** Board bit id, e.g. "KEY[0]", "HEX1[6]" or "MAX10_CLK1_50". */
  board: string;
}

export interface BypassSetting {
  /** Hierarchical net name in the flattened design, e.g. "clkdiv.CLK_1Hz". */
  net: string;
  mode: 'clock' | 'high' | 'low';
}

export type ExportLevel = 1 | 2 | 3;

export interface NanoLogicProject {
  format: 'nanologic-project';
  version: 1;
  name: string;
  boardId: string;
  topLevelEntity: string;
  /** Paths relative to the project file's folder, with forward slashes. */
  designFiles: string[];
  testbenchFiles: string[];
  pinAssignments: PinAssignment[];
  exportLevel: ExportLevel;
  simulation: {
    maxTimeNs: number;
    lastTestbench?: string;
  };
  virtualBoard: {
    bypass: BypassSetting[];
    /** Constant values for unmapped top-level inputs, by port name. */
    tieOffs: Record<string, number>;
  };
}

export const PROJECT_EXTENSION = '.nlproj';

export function isValidName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export function createProject(init: {
  name: string;
  boardId?: string;
  topLevelEntity: string;
  designFiles?: string[];
  testbenchFiles?: string[];
}): NanoLogicProject {
  return {
    format: 'nanologic-project',
    version: 1,
    name: init.name,
    boardId: init.boardId ?? 'de10-lite',
    topLevelEntity: init.topLevelEntity,
    designFiles: init.designFiles ?? [],
    testbenchFiles: init.testbenchFiles ?? [],
    pinAssignments: [],
    exportLevel: 3,
    simulation: { maxTimeNs: 1_000_000 },
    virtualBoard: { bypass: [], tieOffs: {} },
  };
}

/** Parse and validate a project file, filling defaults for missing optional fields. */
export function parseProject(text: string): NanoLogicProject {
  let raw: Partial<NanoLogicProject>;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`Project file is not valid JSON: ${(e as Error).message}`);
  }
  if (raw.format !== 'nanologic-project') throw new Error('Not a NanoLogic project file');
  if (typeof raw.name !== 'string' || typeof raw.topLevelEntity !== 'string') {
    throw new Error('Project file is missing its name or top-level entity');
  }
  const base = createProject({ name: raw.name, topLevelEntity: raw.topLevelEntity, boardId: raw.boardId });
  return {
    ...base,
    ...raw,
    designFiles: Array.isArray(raw.designFiles) ? raw.designFiles : [],
    testbenchFiles: Array.isArray(raw.testbenchFiles) ? raw.testbenchFiles : [],
    pinAssignments: Array.isArray(raw.pinAssignments) ? raw.pinAssignments : [],
    exportLevel: raw.exportLevel === 1 || raw.exportLevel === 2 ? raw.exportLevel : 3,
    simulation: { ...base.simulation, ...(raw.simulation ?? {}) },
    virtualBoard: {
      bypass: raw.virtualBoard?.bypass ?? [],
      tieOffs: raw.virtualBoard?.tieOffs ?? {},
    },
  } as NanoLogicProject;
}

export function serializeProject(p: NanoLogicProject): string {
  return JSON.stringify(p, null, 2) + '\n';
}
