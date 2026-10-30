import { useMemo, useState } from 'react';
import type { ClockSpeed } from '@shared/api';
import { getBoard } from '@shared/board';
import { defaultTieOff } from '@shared/netsim/boardEngine';
import type { BypassSetting } from '@shared/project';
import { openSingleton, resetBoard, setBoardClock, setBoardInputs, startBoard, stepBoard, updateProject } from '../state/actions';
import { useStore } from '../state/store';
import { tokens } from '../theme';

const SPEEDS: { value: ClockSpeed; label: string }[] = [
  { value: 1, label: '1 Hz' },
  { value: 10, label: '10 Hz' },
  { value: 1000, label: '1 kHz' },
  { value: 'max', label: 'Max' },
];

/** Segment polygons for a 7-segment digit in a 60x100 box; index = bit (0 = top ... 6 = middle). */
const SEGMENTS: string[] = [
  '12,6 48,6 42,12 18,12', // 0 top
  '50,8 50,47 44,43 44,14', // 1 top-right
  '50,53 50,92 44,86 44,57', // 2 bottom-right
  '12,94 48,94 42,88 18,88', // 3 bottom
  '10,53 16,57 16,86 10,92', // 4 bottom-left
  '10,8 16,14 16,43 10,47', // 5 top-left
  '12,50 18,46 42,46 48,50 42,54 18,54', // 6 middle
];

function SevenSeg({ name, levels }: { name: string; levels: (0 | 1 | null)[] }) {
  // Common anode: a segment is lit when its bit is 0.
  const lit = (bit: number) => levels[bit] === 0;
  const c = tokens.color;
  return (
    <div style={{ textAlign: 'center' }} data-testid={`board-${name}`} data-levels={levels.map((l) => (l === null ? '-' : l)).join('')}>
      <svg width="54" height="86" viewBox="0 0 64 100" style={{ background: '#fff', border: `1px solid ${c.border}` }}>
        {SEGMENTS.map((pts, i) => (
          <polygon key={i} points={pts} fill={lit(i) ? c.segOn : c.segOff} data-seg={i} data-lit={lit(i) ? 1 : 0} />
        ))}
        <circle cx="57" cy="92" r="4" fill={lit(7) ? c.segOn : c.segOff} data-seg={7} data-lit={lit(7) ? 1 : 0} />
      </svg>
      <div className="mono secondary" style={{ fontSize: 11 }}>
        {name}
      </div>
    </div>
  );
}

function Led({ index, level }: { index: number; level: 0 | 1 | null }) {
  const on = level === 1;
  return (
    <div style={{ textAlign: 'center', width: 30 }}>
      <div
        data-testid={`board-LEDR${index}`}
        data-lit={on ? 1 : 0}
        style={{
          width: 14,
          height: 22,
          margin: '0 auto',
          borderRadius: 2,
          border: `1px solid ${tokens.color.border}`,
          background: on ? tokens.color.ledOn : tokens.color.ledOff,
        }}
      />
      <div className="mono secondary" style={{ fontSize: 10, marginTop: 2 }}>
        {index}
      </div>
    </div>
  );
}

function Switch({ index, up, onToggle }: { index: number; up: boolean; onToggle: () => void }) {
  return (
    <div style={{ textAlign: 'center', width: 30 }}>
      <button
        data-testid={`board-SW${index}`}
        data-up={up ? 1 : 0}
        onClick={onToggle}
        title={`SW${index}: ${up ? 'up (1)' : 'down (0)'} - click to toggle`}
        style={{
          width: 18,
          height: 40,
          padding: 0,
          border: `1px solid ${tokens.color.borderStrong}`,
          borderRadius: 2,
          background: '#fff',
          position: 'relative',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: 2,
            right: 2,
            height: 16,
            top: up ? 2 : 20,
            background: tokens.color.text,
            borderRadius: 1,
          }}
        />
      </button>
      <div className="mono secondary" style={{ fontSize: 10, marginTop: 2 }}>
        SW{index}
      </div>
    </div>
  );
}

function Key({ index, pressed, onPress }: { index: number; pressed: boolean; onPress: (down: boolean) => void }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <button
        data-testid={`board-KEY${index}`}
        data-pressed={pressed ? 1 : 0}
        onMouseDown={() => onPress(true)}
        onMouseUp={() => onPress(false)}
        onMouseLeave={() => pressed && onPress(false)}
        title={`KEY${index}: hold to press (reads 0 while pressed)`}
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: `1px solid ${tokens.color.borderStrong}`,
          background: pressed ? tokens.color.bgSelected : '#fff',
          boxShadow: pressed ? 'inset 0 2px 4px rgba(0,0,0,0.2)' : 'none',
          cursor: 'pointer',
        }}
      />
      <div className="mono secondary" style={{ fontSize: 10, marginTop: 2 }}>
        KEY{index}
      </div>
    </div>
  );
}

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
  const out = st?.outputs ?? {};
  const levels = (name: string, n: number) => out[name] ?? Array<null>(n).fill(null);
  const { SW, KEY } = board.inputs;
  const running = !!st?.running;
  const clockHz = def.groups.find((g) => g.name === 'MAX10_CLK1_50')?.frequencyHz ?? 50e6;
  const report = board.report;
  const bypass = project.project.virtualBoard.bypass;
  const assignments = project.project.pinAssignments;

  const mappedTo = (groupName: string) => {
    const ports = new Set(assignments.filter((a) => a.board.startsWith(groupName)).map((a) => a.port));
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
            ? `${running ? `Running at ${formatHz(st?.actualHz ?? 0)}` : 'Paused'} · real board: ${formatHz(clockHz)}${
                running && st?.actualHz ? ` (${Math.max(1, Math.round(clockHz / Math.max(st.actualHz, 1e-9))).toLocaleString()}× slower)` : ''
              } · ${st?.cycles.toLocaleString() ?? 0} cycles`
            : 'Press Start to build the design and run it on the virtual board.'}
        </span>
      </div>

      {st?.error && <div className="notice error" style={{ margin: 12 }}>{st.error}</div>}
      {board.started && report && !report.clockPorts.length && !bypass.some((b) => b.mode === 'clock') && (
        <div className="notice warning" style={{ margin: 12 }}>
          No port is connected to the board clock (MAX10_CLK1_50), so the clock controls do nothing. Map your clock port in the Pin Planner.
        </div>
      )}

      {/* The board, laid out like the DE10-Lite */}
      <div
        style={{
          margin: 16,
          padding: 20,
          border: `1px solid ${tokens.color.borderStrong}`,
          background: tokens.color.boardBg,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 32,
          minWidth: 900,
          opacity: board.started ? 1 : 0.55,
        }}
        data-testid="board"
      >
        <div>
          <div className="row" style={{ gap: 6 }}>
            {[5, 4, 3, 2, 1, 0].map((i) => (
              <SevenSeg key={i} name={`HEX${i}`} levels={levels(`HEX${i}`, 8)} />
            ))}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="row" style={{ gap: 4, marginBottom: 16 }}>
            {[9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((i) => (
              <Led key={i} index={i} level={levels('LEDR', 10)[i]} />
            ))}
          </div>
          <div className="row" style={{ gap: 4 }}>
            {[9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((i) => (
              <Switch key={i} index={i} up={((SW >> i) & 1) === 1} onToggle={() => setBoardInputs({ SW: SW ^ (1 << i) })} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 0].map((i) => (
            <Key
              key={i}
              index={i}
              pressed={((KEY >> i) & 1) === 0}
              onPress={(down) => setBoardInputs({ KEY: down ? KEY & ~(1 << i) : KEY | (1 << i) })}
            />
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, padding: '0 16px 16px' }}>
        <div>
          <div className="tree-group" style={{ paddingLeft: 0 }}>
            Connections
          </div>
          <table className="data-table" data-testid="board-connections">
            <tbody>
              {['MAX10_CLK1_50', 'KEY', 'SW', 'LEDR', 'HEX0', 'HEX1', 'HEX2', 'HEX3', 'HEX4', 'HEX5'].map((g) => (
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
            A 50 MHz clock divided down to 1 Hz needs 50 million cycles per tick, which is slow even at Max speed. Pick the divided clock (or the
            clock-enable) inside your design and let the virtual board drive it directly. This only affects the virtual board, not your code or the
            Quartus export.
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
