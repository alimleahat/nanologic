import { BoardView } from '../board/BoardView';
import { VerilogEditor } from '../editor/VerilogEditor';
import { PinAssignments } from '../pins/PinAssignments';
import { activate, closeDoc } from '../state/actions';
import { useStore } from '../state/store';
import { WaveformViewer } from '../waveform/WaveformViewer';
import { Welcome } from './Welcome';

export function DocumentArea() {
  const docs = useStore((s) => s.docs);
  const active = useStore((s) => s.active);
  const doc = docs.find((d) => d.id === active);
  return (
    <div className="panel" data-testid="document-area">
      <div className="tabs" role="tablist">
        {docs.map((d) => {
          const dirty = d.kind === 'editor' && d.text !== d.saved;
          return (
            <div
              key={d.id}
              role="tab"
              className={`tab ${d.id === active ? 'active' : ''}`}
              data-testid={`tab-${d.id}`}
              onMouseDown={() => activate(d.id)}
              title={d.kind === 'editor' ? d.rel : d.title}
            >
              <span>{d.title}</span>
              {dirty && (
                <span className="dirty" data-testid="dirty-indicator" title="Unsaved changes">
                  ●
                </span>
              )}
              <button
                className="close"
                aria-label={`Close ${d.title}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => closeDoc(d.id)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="panel-body" style={{ overflow: 'hidden', position: 'relative' }}>
        {!doc && <div className="empty">Open a file from the Project Navigator.</div>}
        {doc?.kind === 'welcome' && <Welcome />}
        {doc?.kind === 'editor' && <VerilogEditor doc={doc} />}
        {doc?.kind === 'waveform' && <WaveformViewer key={doc.id} doc={doc} />}
        {doc?.kind === 'board' && <BoardView />}
        {doc?.kind === 'pins' && <PinAssignments />}
      </div>
    </div>
  );
}
