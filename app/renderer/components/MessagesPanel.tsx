import { useMemo, useState } from 'react';
import type { Severity } from '@shared/messages';
import { openFile } from '../state/actions';
import { store, useStore } from '../state/store';

type Filter = 'all' | Severity;

export function MessagesPanel() {
  const messages = useStore((s) => s.messages);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0 };
    for (const m of messages) c[m.severity]++;
    return c;
  }, [messages]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages
      .filter((m) => filter === 'all' || m.severity === filter)
      .filter((m) => !q || m.text.toLowerCase().includes(q) || (m.file ?? '').toLowerCase().includes(q));
  }, [messages, filter, query]);
  const filters: [Filter, string][] = [
    ['all', `All (${messages.length})`],
    ['error', `Errors (${counts.error})`],
    ['warning', `Warnings (${counts.warning})`],
    ['info', `Info (${counts.info})`],
  ];

  return (
    <div className="panel" data-testid="messages-panel">
      <div className="panel-header">
        <div className="row">
          <span style={{ marginRight: 8 }}>Messages</span>
          {filters.map(([f, label]) => (
            <button key={f} className={`btn small ${filter === f ? 'active' : 'ghost'}`} onClick={() => setFilter(f)} data-testid={`msg-filter-${f}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="row">
          <input
            className="input small"
            placeholder="Search messages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="msg-search"
            style={{ width: 220, fontWeight: 400 }}
          />
          <button className="btn small ghost" onClick={() => store.set({ messages: [] })}>
            Clear
          </button>
        </div>
      </div>
      <div className="panel-body">
        <table className="messages-table" data-testid="messages-table">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Type</th>
              <th>Message</th>
              <th style={{ width: 220 }}>File</th>
              <th style={{ width: 60 }}>Line</th>
              <th style={{ width: 90 }}>Source</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m, i) => (
              <tr
                key={i}
                className={m.file && m.line ? 'clickable' : ''}
                data-severity={m.severity}
                onClick={() => m.file && m.line && void openFile(m.file, m.line, m.column)}
              >
                <td className={`sev ${m.severity}`}>{m.severity === 'error' ? 'Error' : m.severity === 'warning' ? 'Warning' : 'Info'}</td>
                <td>{m.text}</td>
                <td className="mono secondary">{m.file ?? ''}</td>
                <td className="mono secondary">{m.line ?? ''}</td>
                <td className="secondary">{m.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div className="empty">{messages.length ? 'No messages match the filter.' : 'No messages.'}</div>}
      </div>
    </div>
  );
}
