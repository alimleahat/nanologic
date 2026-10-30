import { openDialog, openSingleton, runAnalysis, startBoard } from '../state/actions';
import { useStore, type TaskId, type TaskStatus } from '../state/store';

const TASKS: { id: TaskId; label: string; run: () => void }[] = [
  { id: 'analysis', label: 'Analysis', run: () => void runAnalysis() },
  { id: 'simulation', label: 'Simulation', run: () => openDialog('simulate') },
  { id: 'board', label: 'Virtual Board', run: () => void startBoard() },
  { id: 'export', label: 'Export to Quartus', run: () => openDialog('export') },
];

const STATUS_TEXT: Record<TaskStatus, string> = { idle: 'Not run', running: 'Running', passed: 'Passed', failed: 'Failed' };

export function TasksPanel() {
  const tasks = useStore((s) => s.tasks);
  const hasProject = useStore((s) => !!s.project);
  return (
    <div className="panel" data-testid="tasks-panel">
      <div className="panel-header">
        <span>Tasks</span>
        <span className="secondary" style={{ fontWeight: 400 }}>
          Double-click to run
        </span>
      </div>
      <div className="panel-body">
        <div className="tree-group">Flow</div>
        {TASKS.map((t) => (
          <div
            key={t.id}
            className="task-row"
            data-testid={`task-${t.id}`}
            data-status={tasks[t.id]}
            title={hasProject ? `Double-click to run ${t.label}` : 'Open a project first'}
            onDoubleClick={() => hasProject && t.run()}
          >
            <span className={`status-dot ${tasks[t.id]}`} />
            <span style={{ flex: 1 }}>{t.label}</span>
            <span className="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
              {STATUS_TEXT[tasks[t.id]]}
            </span>
          </div>
        ))}
        {hasProject && (
          <>
            <div className="tree-group">Tools</div>
            <div className="task-row" onDoubleClick={() => openSingleton('pins')}>
              <span className="status-dot" style={{ visibility: 'hidden' }} />
              Pin Assignments
            </div>
          </>
        )}
      </div>
    </div>
  );
}
