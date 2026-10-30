import { getBoard } from '@shared/board';
import { useStore } from '../state/store';

export function StatusBar() {
  const project = useStore((s) => s.project);
  const status = useStore((s) => s.statusText);
  return (
    <div className="statusbar" data-testid="statusbar">
      <span>{project ? `Project: ${project.project.name}` : 'No project'}</span>
      <span>{project ? `Board: ${getBoard(project.project.boardId).name}` : ''}</span>
      <span>{project ? `Top: ${project.project.topLevelEntity}` : ''}</span>
      <span className="grow" data-testid="status-text">
        {status}
      </span>
    </div>
  );
}
