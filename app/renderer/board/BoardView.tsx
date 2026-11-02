import { useMemo, useState } from 'react';
import type { ClockSpeed } from '@shared/api';
import { getBoard, mainClock } from '@shared/board';
import { defaultTieOff } from '@shared/netsim/boardEngine';
import type { BypassSetting } from '@shared/project';
import { exportToolName } from '@shared/boardExport';
import { openSingleton, resetBoard, setBoardClock, startBoard, stepBoard, updateProject } from '../state/actions';
import { useStore } from '../state/store';
import { Basys3Panel, De10LitePanel } from './BoardPanels';

const SPEEDS: { value: ClockSpeed; label: string }[] = [
  { value: 1, label: '1 Hz' },
  { value: 10, label: '10 Hz' },
  { value: 1000, label: '1 kHz' },
  { value: 'max', label: 'Max' },
];

function formatHz(hz: number): string {
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(2)} MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(1)} kHz`;
  return `${hz.toFixed(hz < 10 ? 1 : 0)} Hz`;
}

export function BoardView() {
  const project = useStore((s) => s.project);
  const board = useStore((s) => s.board);
  const ports = useStore((s) => s.ports);
  const [speed, setSpeed] = useState<ClockSpeed>(1);
  const [bypassNet, setBypassNet] = useState('');
  const [bypassMode, setBypassMode] = useState<BypassSetting['mode']>('clock');
  const def = useMemo(() => (project ? getBoard(project.project.boardId) : undefined), [project?.project.boardId]);
  if (!project || !def) return <div className="empty">Open a project first.</div>;

  const st = board.state;
  const running = !!st?.running;
  const clock = mainClock(def);
  const clockHz = clock?.frequencyHz ?? 50e6;
  const report = board.report;
  const bypass = project.project.virtualBoard.bypass;
  const assignments = project.project.pinAssignments;
  const clockBypass = bypass.filter((b) => b.mode === 'clock').map((b) => b.net);

  const mappedTo = (groupName: string) => {
    const ports = new Set(assignments.filter((a) => a.board === groupName || a.board.startsWith(`${groupName}[`)).map((a) => a.port));
    return [...ports].join(', ');
  };

  const changeBypass = async (next: BypassSetting[]) => {
    await updateProject((p) => ({ ...p, virtualBoard: { ...p.virtualBoard, bypass: next } }));
    if (board.started) await startBoard();
  };

  const setTie = async (port: string, value: number) => {
    await updateProject((p) => ({ ...p, virtualBoard: { ...p.virtualBoard, tieOffs: { ...p.virtualBoard.tieOffs, [port]: value } } }));
    if (board.started) await startBoard();
  };

  return (
    <div style={{ height: '100%', overflow: 'auto' }} data-testid="board-view">
      <div className="toolbar" style={{ height: 'auto', minHeight: 40, flexWrap: 'wrap', paddingTop: 6, paddingBottom: 6 }}>
        <button className="btn primary" onClick={() => void startBoard()} disabled={board.starting} data-testid="board-start">
          {board.starting ? 'Building...' : board.started ? 'Rebuild' : 'Start'}
        </button>
        <div className="toolbar-sep" />
        <span className="secondary">Clock</span>
        {SPEEDS.map((s) => (
          <button
            key={String(s.value)}
            className={`btn small ${speed === s.value ? 'active' : ''}`}
            data-testid={`board-speed-${s.value}`}
            onClick={() => {
              setSpeed(s.value);
              setBoardClock({ speed: s.value });
            }}
          >
            {s.label}
          </button>
        ))}
        <button
          className="btn small"
          disabled={!board.started}
          data-testid="board-run"
          onClick={() => setBoardClock({ running: !running, speed })}
        >
          {running ? 'Pause' : 'Run'}
        </button>
        <button className="btn small" disabled={!board.started} onClick={() => stepBoard(1)} data-testid="board-step">
          Step
        </button>
        <button className="btn small" disabled={!board.started} onClick={() => resetBoard()} data-testid="board-reset">
          Reset
        </button>
        <div className="toolbar-sep" />
        <span className="secondary" data-testid="board-clock-info" style={{ fontSize: 'var(--font-size-sm)' }}>
          {board.started
            ? `${running ? `Running at ${formatHz(st?.actualHz ?? 0)}` : 'Paused'} · ${
                clockBypass.length
                  ? `the board clock drives ${clockBypass.join(', ')} directly (bypass)`
                  : `real board: ${formatHz(clockHz)}${
                      running && st?.actualHz ? ` (${Math.max(1, Math.round(clockHz / Math.max(st.actualHz, 1e-9))).toLocaleString()}× slower)` : ''
                    }`
              } · ${st?.cycles.toLocaleString() ?? 0} cycles`
            : 'Press Start to build the design and run it on the virtual board.'}
        </span>
      </div>

      {st?.error && <div className="notice error" style={{ margin: 12 }}>{st.error}</div>}
      {board.started && report && !report.clockPorts.length && !bypass.some((b) => b.mode === 'clock') && (
        <div className="notice warning" style={{ margin: 12 }}>
          No port is connected to the board clock ({clock?.name}), so the clock controls do nothing. Map your clock port in the Pin Planner.
        </div>
      )}

      {def.statusNote && (
        <div className="notice warning" style={{ margin: '12px 16px 0' }} data-testid="board-experimental">
          <strong>{def.name}: {def.statusNote}.</strong> The virtual board follows Digilent&apos;s documentation; nothing has been checked on a real board yet.
        </div>
      )}
      {def.id === 'basys3' ? (
        <Basys3Panel started={board.started} state={st} inputs={board.inputs} />
      ) : (
        <De10LitePanel started={board.started} state={st} inputs={board.inputs} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, padding: '0 16px 16px' }}>
        <div>
          <div className="tree-group" style={{ paddingLeft: 0 }}>
            Connections
          </div>
          <table className="data-table" data-testid="board-connections">
            <tbody>
              {def.groups
                .filter((g) => g.virtual)
                .map((g) => g.name)
                .map((g) => (
                <tr key={g}>
                  <td className="mono">{g}</td>
                  <td>{mappedTo(g) || <span className="secondary">not used</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => openSingleton('pins')}>
              Open Pin Planner
            </button>
          </div>
          {report && (report.unmappedInputs.length > 0 || report.unmappedOutputs.length > 0) && (
            <div className="notice warning" style={{ marginTop: 12 }} data-testid="board-unmapped">
              {report.unmappedInputs.length > 0 && (
                <div>
                  <strong>Unmapped inputs</strong> are held at a fixed value:
                  {report.unmappedInputs.map((u) => (
                    <div key={u.port} className="row" style={{ marginTop: 4 }}>
                      <span className="mono">{u.port}</span>
                      <select
                        className="select small"
                        value={project.project.virtualBoard.tieOffs[u.port] ?? defaultTieOff(u.port)}
                        onChange={(e) => void setTie(u.port, Number(e.target.value))}
                      >
                        <option value={0}>0</option>
                        <option value={u.width > 1 ? 2 ** Math.min(u.width, 31) - 1 : 1}>{u.width > 1 ? 'all 1s' : '1'}</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
              {report.unmappedOutputs.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <strong>Unmapped outputs</strong> are not shown: <span className="mono">{report.unmappedOutputs.join(', ')}</span>
                </div>
              )}
            </div>
          )}
        </div>
        <div>
          <div className="tree-group" style={{ paddingLeft: 0 }}>
            Divider bypass
          </div>
          <div className="secondary" style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.45, marginBottom: 8 }}>
            A {formatHz(clockHz)} clock divided down to 1 Hz needs {(clockHz / 1e6).toLocaleString()} million cycles per tick, which is slow even at Max
            speed. Pick the divided clock (or the clock-enable) inside your design and let the virtual board drive it directly. This only affects the
            virtual board, not your code or the {exportToolName(def.toolchain)} export.
          </div>
          {bypass.map((b) => (
            <div key={b.net} className="row" style={{ marginBottom: 4 }} data-testid={`bypass-${b.net}`}>
              <span className="mono">{b.net}</span>
              <span className="badge">{b.mode === 'clock' ? 'driven by board clock' : b.mode === 'high' ? 'held at 1' : 'held at 0'}</span>
              <button className="btn small ghost" onClick={() => void changeBypass(bypass.filter((x) => x.net !== b.net))}>
                Remove
              </button>
            </div>
          ))}
          <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <select className="select small" value={bypassNet} onChange={(e) => setBypassNet(e.target.value)} data-testid="bypass-net" style={{ maxWidth: 240 }}>
              <option value="">{board.nets.length ? 'Choose a signal...' : 'Start the board to list signals'}</option>
              {board.nets
                .filter((n) => !ports.some((p) => p.name === n.name))
                .map((n) => (
                  <option key={n.name} value={n.name}>
                    {n.name}
                    {n.width > 1 ? ` [${n.width - 1}:0]` : ''}
                    {n.registered ? ' (register)' : ''}
                  </option>
                ))}
            </select>
            <select className="select small" value={bypassMode} onChange={(e) => setBypassMode(e.target.value as BypassSetting['mode'])} data-testid="bypass-mode">
              <option value="clock">Drive with board clock</option>
              <option value="high">Hold at 1 (clock enable)</option>
              <option value="low">Hold at 0</option>
            </select>
            <button
              className="btn small"
              disabled={!bypassNet}
              data-testid="bypass-add"
              onClick={() => {
                void changeBypass([...bypass.filter((b) => b.net !== bypassNet), { net: bypassNet, mode: bypassMode }]);
                setBypassNet('');
              }}
            >
              Add bypass
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
