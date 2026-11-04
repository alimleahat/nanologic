import { useMemo, useState } from 'react';
import { boardLabel, findBoardBit, getBoard, listBoardBits } from '@shared/board';
import { autoMap, mapPortToGroup, perDigitSegmentPorts, portBitName, setAssignment, sortAssignments, validatePins } from '@shared/pins';
import { portBitIndices, type TopPort } from '@shared/toolTypes';
import { runAnalysis, updateProject } from '../state/actions';
import { useStore } from '../state/store';

export function PinAssignments() {
  const project = useStore((s) => s.project);
  const ports = useStore((s) => s.ports);
  const analysisStatus = useStore((s) => s.tasks.analysis);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const board = useMemo(() => (project ? getBoard(project.project.boardId) : undefined), [project?.project.boardId]);
  if (!project || !board) return <div className="empty">Open a project first.</div>;
  const list = project.project.pinAssignments;
  const bits = listBoardBits(board);
  const issues = validatePins(ports, list, board);
  const perDigit = perDigitSegmentPorts(ports, board);

  const save = (next: typeof list) => void updateProject((p) => ({ ...p, pinAssignments: sortAssignments(next, ports) }));
  const assigned = (port: string, bit: number | null) => list.find((a) => a.port === port && a.bit === bit)?.board ?? '';
  const usedBy = new Map(list.map((a) => [a.board, a.bit === null ? a.port : `${a.port}[${a.bit}]`]));

  const options = (p: TopPort) => {
    const wantInput = p.direction !== 'output';
    return bits.filter((b) => (b.group.direction === 'input') === wantInput);
  };

  const bitRow = (p: TopPort, bit: number | null, nested: boolean) => {
    const cur = assigned(p.name, bit);
    const bb = cur ? findBoardBit(board, cur) : undefined;
    const label = portBitName(p, bit);
    return (
      <tr key={label} data-testid={`pin-row-${label}`}>
        <td className="mono" style={{ paddingLeft: nested ? 28 : 8 }}>
          {label}
        </td>
        <td>{nested ? '' : p.direction}</td>
        <td>{nested ? '' : p.width}</td>
        <td>
          <select
            className="select small"
            value={cur}
            data-testid={`pin-select-${label}`}
            onChange={(e) => save(setAssignment(list, p.name, bit, e.target.value))}
          >
            <option value="">(unassigned)</option>
            {options(p).map((o) => (
              <option key={o.id} value={o.id}>
                {o.id}
                {usedBy.has(o.id) && usedBy.get(o.id) !== label ? `  (used by ${usedBy.get(o.id)})` : ''}
              </option>
            ))}
          </select>
        </td>
        <td className="mono">{bb?.pin ?? ''}</td>
        <td>{bb?.group.ioStandard ?? ''}</td>
        <td className="secondary">{bb ? (bb.group.activeLow ? 'active-low' : 'active-high') : ''}</td>
      </tr>
    );
  };

  return (
    <div style={{ height: '100%', overflow: 'auto' }} data-testid="pin-assignments">
      <div className="toolbar">
        <button className="btn" onClick={() => save(autoMap(ports, board, list))} disabled={!ports.length} data-testid="pins-automap">
          Auto-map standard names
        </button>
        <button className="btn" onClick={() => window.confirm('Remove all pin assignments?') && save([])} disabled={!list.length}>
          Clear all
        </button>
        <button className="btn" onClick={() => void runAnalysis()} disabled={analysisStatus === 'running'}>
          {analysisStatus === 'running' ? 'Analysing...' : 'Refresh ports (Analysis)'}
        </button>
        <span className="secondary" style={{ marginLeft: 'auto', fontSize: 'var(--font-size-sm)' }}>
          {board.name} · {board.family} {board.device} · {list.length} pins assigned
        </span>
      </div>
      {!ports.length && (
        <div className="empty">Run Analysis to list the top-level ports of {project.project.topLevelEntity}.</div>
      )}
      {board.statusNote && (
        <div className="notice warning" style={{ margin: '12px 12px 0' }}>
          <strong>{boardLabel(board)}.</strong> Pin data comes from {board.source}.
        </div>
      )}
      {perDigit.length > 0 && board.display && (
        <div className="notice warning" style={{ margin: 12, lineHeight: 1.5 }} data-testid="pins-multiplex-notice">
          <strong>This design needs a display multiplexer to run on the {board.name}.</strong>
          <div style={{ marginTop: 4 }}>
            The outputs <span className="mono">{perDigit.map((p) => p.name).join(', ')}</span> each drive a whole digit. That works on boards
            with separate segment pins per digit (like the DE10-Lite&apos;s HEX0-HEX5), but the {board.name}&apos;s {board.display.digits} digits
            share one set of segment lines (<span className="mono">{board.display.segments}</span>
            {board.display.decimalPoint ? (
              <>
                , <span className="mono">{board.display.decimalPoint}</span>
              </>
            ) : null}
            ). Each digit has its own enable (<span className="mono">{board.display.anodes}</span>, active-low).
          </div>
          <div style={{ marginTop: 4 }}>
            To show several digits, add a module that enables one digit at a time (set one <span className="mono">{board.display.anodes}</span> bit
            to 0), puts that digit&apos;s pattern on <span className="mono">{board.display.segments}</span>, and moves to the next digit about every
            millisecond. Then map its outputs to <span className="mono">{board.display.segments}</span> and{' '}
            <span className="mono">{board.display.anodes}</span>. The Basys 3 starter example shows how. NanoLogic does not change your design for
            you.
          </div>
          <div style={{ marginTop: 4 }}>
            Mapping one of these outputs straight to <span className="mono">{board.display.segments}</span> (with that digit&apos;s{' '}
            <span className="mono">{board.display.anodes}</span> bit tied low in your code) shows just that one digit.
          </div>
        </div>
      )}
      {issues.length > 0 && ports.length > 0 && (
        <div style={{ padding: '8px 12px' }} data-testid="pin-issues">
          {issues.map((m, i) => (
            <div key={i} className={`sev ${m.severity}`} style={{ fontWeight: 400, padding: '2px 0', fontSize: 'var(--font-size-sm)' }}>
              <strong>{m.severity === 'error' ? 'Error' : m.severity === 'warning' ? 'Warning' : 'Info'}:</strong> {m.text}
            </div>
          ))}
        </div>
      )}
      {ports.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 200 }}>Port</th>
              <th style={{ width: 80 }}>Direction</th>
              <th style={{ width: 60 }}>Width</th>
              <th style={{ width: 260 }}>Board signal</th>
              <th style={{ width: 80 }}>Pin</th>
              <th style={{ width: 180 }}>I/O standard</th>
              <th>Polarity</th>
            </tr>
          </thead>
          <tbody>
            {ports.map((p) => {
              if (p.scalar) return bitRow(p, null, false);
              const idx = portBitIndices(p);
              const open = expanded[p.name] ?? true;
              const groups = board.groups.filter((g) => (g.direction === 'input') === (p.direction !== 'output') && !g.scalar);
              const mappedCount = list.filter((a) => a.port === p.name).length;
              return [
                <tr key={p.name} className="port-row" data-testid={`pin-port-${p.name}`}>
                  <td className="mono">
                    <span className="twisty" style={{ cursor: 'pointer', display: 'inline-block', width: 16 }} onClick={() => setExpanded({ ...expanded, [p.name]: !open })}>
                      {open ? '▾' : '▸'}
                    </span>
                    {p.name}[{p.msb}:{p.lsb}]
                  </td>
                  <td>{p.direction}</td>
                  <td>{p.width}</td>
                  <td>
                    <select
                      className="select small"
                      value=""
                      data-testid={`pin-group-${p.name}`}
                      onChange={(e) => {
                        const [gname, start] = e.target.value.split('@');
                        const g = board.groups.find((x) => x.name === gname);
                        if (g) save(mapPortToGroup(list, p, g, Number(start)));
                      }}
                    >
                      <option value="">Map all bits to...</option>
                      {groups.flatMap((g) =>
                        Array.from({ length: Math.max(1, g.pins.length - p.width + 1) }, (_, s) => (
                          <option key={`${g.name}@${s}`} value={`${g.name}@${s}`}>
                            {g.name}[{Math.min(g.pins.length - 1, s + p.width - 1)}:{s}]
                          </option>
                        )),
                      )}
                    </select>
                  </td>
                  <td colSpan={3} className="secondary" style={{ fontWeight: 400 }}>
                    {mappedCount}/{p.width} bits mapped
                  </td>
                </tr>,
                ...(open ? [...idx].reverse().map((b) => bitRow(p, b, true)) : []),
              ];
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
