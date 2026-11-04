import { getBoard, type BoardDefinition } from '@shared/board';
import { exportToolName } from '@shared/boardExport';
import { useStore } from './store';

/** The open project's board, or undefined with no project. */
export function useBoard(): BoardDefinition | undefined {
  const id = useStore((s) => s.project?.project.boardId);
  return id ? getBoard(id) : undefined;
}

/** "Quartus" or "Vivado" for the open project (Quartus when no project is open). */
export function useExportTool(): string {
  return exportToolName(useBoard()?.toolchain ?? 'quartus');
}
