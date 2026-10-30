import { openDialog, openProjectDialog, runAnalysis, saveDoc, startBoard } from '../state/actions';
import { useStore } from '../state/store';

export function Toolbar() {
  const hasProject = useStore((s) => !!s.project);
  const editorActive = useStore((s) => s.docs.find((d) => d.id === s.active)?.kind === 'editor');
  const tasks = useStore((s) => s.tasks);
  return (
    <div className="toolbar" role="toolbar">
      <button className="btn ghost" data-testid="tb-new" onClick={() => openDialog('newProject')}>
        New
      </button>
      <button className="btn ghost" data-testid="tb-open" onClick={() => void openProjectDialog()}>
        Open
      </button>
      <button className="btn ghost" data-testid="tb-save" disabled={!editorActive} onClick={() => void saveDoc()}>
        Save
      </button>
      <div className="toolbar-sep" />
      <button className="btn" data-testid="tb-analyse" disabled={!hasProject || tasks.analysis === 'running'} onClick={() => void runAnalysis()}>
        Analyse
      </button>
      <button className="btn" data-testid="tb-simulate" disabled={!hasProject || tasks.simulation === 'running'} onClick={() => openDialog('simulate')}>
        Simulate
      </button>
      <button className="btn" data-testid="tb-board" disabled={!hasProject} onClick={() => void startBoard()}>
        Run Board
      </button>
      <div className="toolbar-sep" />
      <button className="btn" data-testid="tb-export" disabled={!hasProject} onClick={() => openDialog('export')}>
        Export to Quartus
      </button>
    </div>
  );
}
