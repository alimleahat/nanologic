import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatValue, valueIndexAt, type Radix, type VcdData, type VcdScope, type VcdTrack } from '@shared/vcd';
import type { Doc } from '../state/store';
import { tokens } from '../theme';

type WaveDoc = Extract<Doc, { kind: 'waveform' }>;

interface Shown {
  key: number; // unique row key
  varIndex: number;
  radix: Radix;
}

const ROW_H = 24;
const AXIS_H = 24;
let rowKey = 1;

export function formatTime(t: number, secondsPerUnit: number): string {
  const s = t * secondsPerUnit;
  const abs = Math.abs(s);
  const units: [number, string][] = [
    [1, 's'],
    [1e-3, 'ms'],
    [1e-6, 'us'],
    [1e-9, 'ns'],
    [1e-12, 'ps'],
    [1e-15, 'fs'],
  ];
  for (const [f, u] of units) {
    if (abs >= f || f === 1e-15) {
      const v = s / f;
      return `${Number(v.toFixed(3))} ${u}`;
    }
  }
  return `${s} s`;
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

function defaultSignals(vcd: VcdData): Shown[] {
  const first = vcd.root.scopes[0];
  const idx = first ? first.vars : vcd.vars.map((_, i) => i);
  return idx.slice(0, 32).map((varIndex) => ({ key: rowKey++, varIndex, radix: 'hex' as Radix }));
}

function ScopeTree({ scope, vcd, depth, onAdd }: { scope: VcdScope; vcd: VcdData; depth: number; onAdd: (vars: number[]) => void }) {
  const [open, setOpen] = useState(depth < 2);
  return (
    <>
      <div className="tree-row" style={{ paddingLeft: 4 + depth * 12 }} onDoubleClick={() => onAdd(scope.vars)} title="Double-click to add all signals in this scope">
        <span className="twisty" onClick={() => setOpen(!open)}>
          {scope.scopes.length || scope.vars.length ? (open ? '▾' : '▸') : ''}
        </span>
        <strong>{scope.name}</strong>
      </div>
      {open && (
        <>
          {scope.scopes.map((s, i) => (
            <ScopeTree key={i} scope={s} vcd={vcd} depth={depth + 1} onAdd={onAdd} />
          ))}
          {scope.vars.map((vi) => {
            const v = vcd.vars[vi];
            return (
              <div
                key={vi}
                className="tree-row"
                style={{ paddingLeft: 18 + (depth + 1) * 12 }}
                onDoubleClick={() => onAdd([vi])}
                title={`${v.path}${v.range} (${v.width} bit${v.width > 1 ? 's' : ''}) - double-click to add`}
                data-testid={`wave-tree-${v.path}`}
              >
                <span>{v.name}</span>
                <span className="secondary mono">{v.range}</span>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

export function WaveformViewer({ doc }: { doc: WaveDoc }) {
  const vcd = doc.vcd;
  const [shown, setShown] = useState<Shown[]>(() => defaultSignals(vcd));
  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number>(0);
  const [view, setView] = useState({ t0: 0, unitsPerPx: 1 });
  const [width, setWidth] = useState(800);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const end = Math.max(vcd.endTime, 1);

  const fit = useCallback(() => setView({ t0: 0, unitsPerPx: end / Math.max(100, width - 20) }), [end, width]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    const w = el.clientWidth || 800;
    setWidth(w);
    setView({ t0: 0, unitsPerPx: end / Math.max(100, w - 20) });
    return () => ro.disconnect();
  }, []);

  const zoom = (factor: number, aroundPx?: number) => {
    setView((v) => {
      const px = aroundPx ?? width / 2;
      const tAt = v.t0 + px * v.unitsPerPx;
      const unitsPerPx = Math.min(Math.max(v.unitsPerPx * factor, 1e-6), (end * 4) / Math.max(100, width));
      return { t0: Math.max(0, tAt - px * unitsPerPx), unitsPerPx };
    });
  };

  // ---- drawing ----
  const height = AXIS_H + shown.length * ROW_H + 8;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    const c = tokens.color;
    const { t0, unitsPerPx } = view;
    const t1 = t0 + width * unitsPerPx;
    const x = (t: number) => (t - t0) / unitsPerPx;

    // Axis and grid
    const step = niceStep(unitsPerPx * 100);
    g.font = `11px ${tokens.font.mono}`;
    g.textBaseline = 'middle';
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
      const px = Math.round(x(t)) + 0.5;
      g.strokeStyle = c.waveGrid;
      g.beginPath();
      g.moveTo(px, AXIS_H);
      g.lineTo(px, height);
      g.stroke();
      g.strokeStyle = c.border;
      g.beginPath();
      g.moveTo(px, AXIS_H - 6);
      g.lineTo(px, AXIS_H);
      g.stroke();
      g.fillStyle = c.textSecondary;
      g.fillText(formatTime(t, vcd.secondsPerUnit), px + 3, AXIS_H / 2);
    }
    g.strokeStyle = c.border;
    g.beginPath();
    g.moveTo(0, AXIS_H - 0.5);
    g.lineTo(width, AXIS_H - 0.5);
    g.stroke();

    shown.forEach((s, row) => {
      const v = vcd.vars[s.varIndex];
      const tr = vcd.tracks[v.track];
      const yTop = AXIS_H + row * ROW_H + 4;
      const yBot = yTop + ROW_H - 8;
      if (selected === s.key) {
        g.fillStyle = c.bgSubtle;
        g.fillRect(0, yTop - 4, width, ROW_H);
      }
      drawTrack(g, tr, s.radix, v.type === 'real', x, t0, t1, end, unitsPerPx, yTop, yBot, width);
    });

    // Cursor
    const cx = Math.round(x(cursor)) + 0.5;
    if (cx >= 0 && cx <= width) {
      g.strokeStyle = c.waveCursor;
      g.beginPath();
      g.moveTo(cx, 0);
      g.lineTo(cx, height);
      g.stroke();
    }
  }, [shown, view, width, height, cursor, selected, vcd]);

  // ---- mouse ----
  const drag = useRef<{ x: number; t0: number; moved: boolean } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    drag.current = { x: e.clientX, t0: view.t0, moved: false };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, t0: Math.max(0, d.t0 - dx * v.unitsPerPx) }));
  };
  const onMouseUp = (e: React.MouseEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setCursor(Math.max(0, Math.round(view.t0 + (e.clientX - rect.left) * view.unitsPerPx)));
      const row = Math.floor((e.clientY - rect.top - AXIS_H) / ROW_H);
      if (row >= 0 && row < shown.length) setSelected(shown[row].key);
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      zoom(e.deltaY > 0 ? 1.25 : 0.8, e.clientX - rect.left);
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const d = e.shiftKey ? e.deltaY : e.deltaX;
      setView((v) => ({ ...v, t0: Math.max(0, v.t0 + d * v.unitsPerPx) }));
    }
  };

  // ---- signal list ----
  const add = (vars: number[]) => setShown((s) => [...s, ...vars.map((varIndex) => ({ key: rowKey++, varIndex, radix: 'hex' as Radix }))]);
  const remove = (key: number) => setShown((s) => s.filter((x) => x.key !== key));
  const move = (key: number, dir: -1 | 1) =>
    setShown((s) => {
      const i = s.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.length) return s;
      const n = [...s];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const setRadix = (key: number, radix: Radix) => setShown((s) => s.map((x) => (x.key === key ? { ...x, radix } : x)));
  const dragRow = useRef<number | null>(null);

  const valueAtCursor = (s: Shown) => {
    const v = vcd.vars[s.varIndex];
    const tr = vcd.tracks[v.track];
    const i = valueIndexAt(tr, cursor);
    if (i < 0) return '';
    const raw = tr.values[i];
    if (v.type === 'real') return raw;
    return tr.width > 1 ? formatValue(raw, s.radix) : raw;
  };

  const sel = shown.find((s) => s.key === selected);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) remove(selected);
    if (e.key === '+' || e.key === '=') zoom(0.5);
    if (e.key === '-') zoom(2);
    if (e.key === 'f') fit();
  };

  const scopeRoot = useMemo(() => vcd.root, [vcd]);

  return (
    <div className="panel" data-testid="waveform-viewer" tabIndex={0} onKeyDown={onKeyDown} style={{ outline: 'none' }}>
      <div className="toolbar" style={{ height: 34 }}>
        <button className="btn small" onClick={() => zoom(0.5)} data-testid="wave-zoom-in">
          Zoom in
        </button>
        <button className="btn small" onClick={() => zoom(2)} data-testid="wave-zoom-out">
          Zoom out
        </button>
        <button className="btn small" onClick={fit} data-testid="wave-fit">
          Fit
        </button>
        <div className="toolbar-sep" />
        <span className="secondary">Cursor</span>
        <span className="mono" data-testid="wave-cursor-time">
          {formatTime(cursor, vcd.secondsPerUnit)}
        </span>
        <div className="toolbar-sep" />
        {sel && (
          <>
            <span className="secondary">Radix</span>
            <select className="select small" value={sel.radix} onChange={(e) => setRadix(sel.key, e.target.value as Radix)} data-testid="wave-radix">
              <option value="bin">Binary</option>
              <option value="hex">Hex</option>
              <option value="unsigned">Unsigned</option>
              <option value="signed">Signed</option>
            </select>
            <button className="btn small" onClick={() => move(sel.key, -1)}>
              Up
            </button>
            <button className="btn small" onClick={() => move(sel.key, 1)}>
              Down
            </button>
            <button className="btn small" onClick={() => remove(sel.key)} data-testid="wave-remove">
              Remove
            </button>
          </>
        )}
        <span className="secondary" style={{ marginLeft: 'auto', fontSize: 'var(--font-size-sm)' }}>
          {doc.testbench} · end {formatTime(vcd.endTime, vcd.secondsPerUnit)} · Ctrl/⌘+wheel zooms, drag pans, click sets cursor
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ width: 210, borderRight: `1px solid ${tokens.color.border}`, overflow: 'auto', flexShrink: 0 }} data-testid="wave-signal-tree">
          <div className="tree-group">Signals (double-click to add)</div>
          {scopeRoot.scopes.map((s, i) => (
            <ScopeTree key={i} scope={s} vcd={vcd} depth={0} onAdd={add} />
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex' }}>
          <div style={{ width: 230, flexShrink: 0, borderRight: `1px solid ${tokens.color.border}` }} data-testid="wave-names">
            <div style={{ height: AXIS_H, borderBottom: `1px solid ${tokens.color.border}` }} className="row secondary">
              <span style={{ padding: '0 8px', fontSize: 'var(--font-size-sm)' }}>Name / value at cursor</span>
            </div>
            {shown.map((s) => {
              const v = vcd.vars[s.varIndex];
              return (
                <div
                  key={s.key}
                  className={`tree-row ${selected === s.key ? 'selected' : ''}`}
                  style={{ height: ROW_H, padding: '0 8px', justifyContent: 'space-between' }}
                  onClick={() => setSelected(s.key)}
                  draggable
                  onDragStart={() => (dragRow.current = s.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    const from = dragRow.current;
                    dragRow.current = null;
                    if (from === null || from === s.key) return;
                    setShown((list) => {
                      const item = list.find((x) => x.key === from)!;
                      const rest = list.filter((x) => x.key !== from);
                      const at = rest.findIndex((x) => x.key === s.key);
                      rest.splice(at, 0, item);
                      return rest;
                    });
                  }}
                  title={`${v.path}${v.range}`}
                  data-testid={`wave-row-${v.path}`}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {v.name}
                    <span className="secondary mono">{v.range}</span>
                  </span>
                  <span className="mono" data-testid="wave-value">
                    {valueAtCursor(s)}
                  </span>
                </div>
              );
            })}
          </div>
          <div ref={wrapRef} style={{ flex: 1, minWidth: 0 }}>
            <canvas
              ref={canvasRef}
              data-testid="wave-canvas"
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={() => (drag.current = null)}
              onWheel={onWheel}
              style={{ display: 'block', cursor: 'crosshair' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function drawTrack(
  g: CanvasRenderingContext2D,
  tr: VcdTrack,
  radix: Radix,
  isReal: boolean,
  x: (t: number) => number,
  t0: number,
  t1: number,
  end: number,
  unitsPerPx: number,
  yTop: number,
  yBot: number,
  width: number,
) {
  const c = tokens.color;
  const n = tr.times.length;
  if (n === 0) return;
  let i = Math.max(0, valueIndexAt(tr, t0));
  const yMid = (yTop + yBot) / 2;
  const bus = tr.width !== 1 || isReal;
  g.lineWidth = 1;
  g.font = `11px ${tokens.font.mono}`;
  g.textBaseline = 'middle';
  let lastPx = -Infinity;
  while (i < n) {
    const ts = tr.times[i];
    if (ts > t1) break;
    const te = i + 1 < n ? tr.times[i + 1] : end;
    const xs = Math.max(-1, x(ts));
    const xe = Math.min(width + 1, x(Math.max(te, ts)));
    const val = tr.values[i];
    // Many changes in one pixel: draw a solid block and skip ahead.
    if (xe - xs < 1 && i + 1 < n) {
      const pxEnd = Math.floor(xs) + 1;
      const tEnd = t0 + pxEnd * unitsPerPx;
      let j = i + 1;
      while (j < n && tr.times[j] < tEnd) j++;
      g.fillStyle = c.waveBus;
      g.fillRect(Math.floor(xs), yTop, Math.max(1, pxEnd - Math.floor(xs)), yBot - yTop);
      lastPx = pxEnd;
      i = j - 1 > i ? j - 1 : i + 1;
      continue;
    }
    const isX = /x/.test(val);
    const isZ = !isX && /z/.test(val);
    g.strokeStyle = isX ? c.waveX : isZ ? c.waveZ : bus ? c.waveBus : c.waveLine;
    if (!bus) {
      const y = val === '1' ? yTop : val === '0' ? yBot : yMid;
      g.beginPath();
      if (xs > lastPx) {
        g.moveTo(Math.round(xs) + 0.5, yTop);
        g.lineTo(Math.round(xs) + 0.5, yBot);
      }
      g.moveTo(xs, Math.round(y) + 0.5);
      g.lineTo(xe, Math.round(y) + 0.5);
      g.stroke();
      if (isX || isZ) {
        g.fillStyle = isX ? 'rgba(198,40,40,0.12)' : 'rgba(178,106,0,0.12)';
        g.fillRect(xs, yTop, xe - xs, yBot - yTop);
      }
    } else {
      const k = Math.min(3, (xe - xs) / 2);
      g.beginPath();
      g.moveTo(xs, yMid);
      g.lineTo(xs + k, yTop);
      g.lineTo(xe - k, yTop);
      g.lineTo(xe, yMid);
      g.lineTo(xe - k, yBot);
      g.lineTo(xs + k, yBot);
      g.closePath();
      if (isX || isZ) {
        g.fillStyle = isX ? 'rgba(198,40,40,0.12)' : 'rgba(178,106,0,0.12)';
        g.fill();
      }
      g.stroke();
      const text = isReal ? val : formatValue(val, radix);
      const room = xe - xs - 8;
      if (room > 8) {
        g.save();
        g.beginPath();
        g.rect(xs + 4, yTop, room, yBot - yTop);
        g.clip();
        g.fillStyle = c.text;
        g.fillText(text, Math.max(xs + 4, 4), yMid + 0.5);
        g.restore();
      }
    }
    lastPx = xe;
    i++;
  }
}
