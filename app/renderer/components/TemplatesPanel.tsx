import { useState } from 'react';
import { insertAtCursor } from '../editor/activeEditor';
import { store } from '../state/store';

const files = import.meta.glob('../../../templates/verilog/*.v', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const TEMPLATES = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, text]) => {
    const [first, ...rest] = text.split('\n');
    return {
      id: path.split('/').pop()!.replace(/\.v$/, ''),
      title: first.replace(/^\/\/\s*/, ''),
      text: rest.join('\n').replace(/^\n+/, ''),
      full: text,
    };
  });

export function TemplatesPanel() {
  const [note, setNote] = useState('');
  return (
    <div className="panel" data-testid="templates-panel">
      <div className="panel-header">
        <span>Templates</span>
        <button className="btn small ghost" onClick={() => store.set({ rightPanelOpen: false })} title="Hide">
          ×
        </button>
      </div>
      <div className="panel-body">
        <div className="secondary" style={{ padding: '8px 12px', fontSize: 'var(--font-size-sm)' }}>
          Click Insert to add a template at the cursor in the open Verilog file.
        </div>
        {TEMPLATES.map((t) => (
          <div className="template-item" key={t.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 'var(--font-size-sm)' }}>{t.title}</strong>
              <button
                className="btn small"
                data-testid={`template-${t.id}`}
                onClick={() => setNote(insertAtCursor(t.full) ? '' : 'Open a Verilog file and place the cursor first.')}
              >
                Insert
              </button>
            </div>
            <pre>{t.text}</pre>
          </div>
        ))}
        {note && <div className="notice warning" style={{ margin: 12 }}>{note}</div>}
      </div>
    </div>
  );
}
