// RTL Viewer (like Quartus's Tools > Netlist Viewers > RTL Viewer): the design
// as a schematic. Module instances are blocks; double-click one to open it.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { RtlLayout } from '@shared/rtl/layout';
import { resolveInstancePath, type RtlBit, type RtlEdge, type RtlModuleView, type RtlNode, type RtlPin } from '@shared/rtl/netlist';
import { useContextMenu, type ContextMenuItem } from '../components/ContextMenu';
import { loadRtl, openFile, setRtlMode, setRtlPath } from '../state/actions';
import { useStore } from '../state/store';
import { layoutView } from './elkClient';
import { describeNode, pinKey, RtlSymbol } from './symbols';

interface Selection {
  edges: Set<string>;
  nodes: Set<string>;
  pins: Set<string>;
  text: string;
}

interface View {
  k: number;
  x: number;
  y: number;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
/** Below this zoom the text is unreadable. */
const READABLE = 0.3;

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Everything connected to any of `bits` (constants are not nets, so they never match). */
function selectBits(view: RtlModuleView, bits: RtlBit[], text: string): Selection {
  const set = new Set<RtlBit>(bits.filter((b) => typeof b === 'number'));
  const sel: Selection = { edges: new Set(), nodes: new Set(), pins: new Set(), text };
  for (const e of view.edges) if (e.bits.some((b) => set.has(b))) sel.edges.add(e.id);
  for (const n of view.nodes) {
    for (const p of n.pins) {
      if (p.bits.some((b) => set.has(b))) {
        sel.pins.add(pinKey(n, p));
        sel.nodes.add(n.id);
      }
    }
  }
  return sel;
}

function netText(view: RtlModuleView, name: string | undefined, bits: RtlBit[]): string {
  const set = new Set<RtlBit>(bits.filter((b) => typeof b === 'number'));
  const drivers: string[] = [];
  let loads = 0;
  for (const n of view.nodes) {
    for (const p of n.pins) {
      if (!p.bits.some((b) => set.has(b))) continue;
      if (p.dir === 'out') drivers.push(describeNode(n));
      else loads++;
    }
  }
  const width = bits.length === 1 ? '1 bit' : `${bits.length} bits`;
  const from = drivers.length ? ` · from ${drivers.join(', ')}` : '';
  return `${name ? `Signal ${name}` : 'Unnamed wire'} (${width})${from} · ${plural(loads, 'load')}`;
}

export function RtlViewer() {
  const rtl = useStore((s) => s.rtl);
  const result = rtl.results[rtl.mode];
  const netlist = result?.ok ? result.netlist : undefined;
  const resolved = netlist ? resolveInstancePath(netlist, rtl.path) : undefined;
  const view = resolved && netlist ? netlist.modules[resolved.module] : undefined;
  const path = resolved?.path ?? [];

  const [layout, setLayout] = useState<{ view: RtlModuleView; layout: RtlLayout } | null>(null);
  const [layoutError, setLayoutError] = useState<string>();
  useEffect(() => {
    if (!view) return;
    let live = true;
    setLayoutError(undefined);
    layoutView(view).then(
      (l) => live && setLayout({ view, layout: l }),
      (e: Error) => live && setLayoutError(e.message),
    );
    return () => {
      live = false;
    };
  }, [view]);

  const crumbs = netlist
    ? [
        { label: netlist.modules[netlist.top]?.displayName ?? netlist.top, path: [] as string[] },
        ...path.map((inst, i) => {
          const r = resolveInstancePath(netlist, path.slice(0, i + 1));
          return { label: `${inst} (${netlist.modules[r.module]?.displayName ?? r.module})`, path: path.slice(0, i + 1) };
        }),
      ]
    : [];
  const ready = !!(view && layout && layout.view === view);
  const stale = !!result && result.version !== rtl.version;

  return (
    <div className="rtl-viewer" data-testid="rtl-viewer">
      <div className="toolbar rtl-toolbar">
        <div className="rtl-crumbs" data-testid="rtl-breadcrumb">
          {crumbs.map((c, i) => (
            <span key={i} className="rtl-crumb-wrap">
              {i > 0 && <span className="secondary"> › </span>}
              <button
                className={`rtl-crumb ${i === crumbs.length - 1 ? 'current' : ''}`}
                data-testid={`rtl-crumb-${i}`}
                disabled={i === crumbs.length - 1}
                onClick={() => setRtlPath(c.path)}
              >
                {c.label}
              </button>
            </span>
          ))}
        </div>
        <div className="toolbar-sep" />
        <div className="segmented" role="group" aria-label="View">
          <button className={`btn small ${rtl.mode === 'rtl' ? 'active' : ''}`} onClick={() => setRtlMode('rtl')} data-testid="rtl-mode-rtl" title="Registers, multiplexers, operators and gates as written">
            RTL
          </button>
          <button className={`btn small ${rtl.mode === 'gates' ? 'active' : ''}`} onClick={() => setRtlMode('gates')} data-testid="rtl-mode-gates" title="Everything broken down to AND, OR, NOT, XOR and flip-flops">
            Gates
          </button>
        </div>
        <button className="btn small" onClick={() => void loadRtl(true)} disabled={rtl.building} data-testid="rtl-refresh" title="Rebuild the netlist from the files on screen">
          Refresh
        </button>
        <span className="secondary rtl-status" data-testid="rtl-status">
          {rtl.building
            ? 'Building netlist...'
            : stale
              ? 'Files changed'
              : view
                ? `${rtl.mode === 'gates' ? `${view.logicCount} gates and flip-flops` : plural(view.logicCount, 'logic element')} · ${plural(view.nodes.filter((n) => n.shape === 'module').length, 'instance')}${
                    rtl.mode === 'gates' && view.logicCount > 150 ? ' · large: the RTL view gives a better overview' : ''
                  }`
                : ''}
        </span>
      </div>
      {result && !result.ok && (
        <div className="notice error" style={{ margin: 12 }} data-testid="rtl-error">
          The netlist could not be built. Fix the errors in Messages (Processing &gt; Start Analysis shows them all), then press Refresh.
        </div>
      )}
      {layoutError && <div className="notice error" style={{ margin: 12 }}>Could not draw this module: {layoutError}</div>}
      {!result && <div className="empty">{rtl.building ? 'Building the netlist with Yosys...' : 'The netlist could not be built. See Messages, then press Refresh.'}</div>}
      {view && (
        <RtlCanvas
          key={`${rtl.mode}|${view.name}`}
          view={view}
          layout={ready ? layout!.layout : undefined}
          onOpenModule={(inst) => setRtlPath([...path, inst])}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canvas: pan, zoom, selection

function RtlCanvas({ view, layout, onOpenModule }: { view: RtlModuleView; layout?: RtlLayout; onOpenModule: (instance: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [vt, setVt] = useState<View | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [menu, showMenu] = useContextMenu();
  // A rebuilt netlist (after a save) has new wires: drop the old selection.
  useEffect(() => setSel(null), [view]);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Fit the whole drawing; if that would be too small to read (a tall gate-level
  // view), fit its width instead and start at the top.
  const fit = useCallback(() => {
    if (!layout) return;
    const kw = (size.w - 24) / layout.width;
    const kh = (size.h - 24) / layout.height;
    let k = Math.min(1.5, kw, kh);
    if (k < READABLE && kw > k) k = Math.min(kw, 1);
    k = Math.max(MIN_ZOOM, k);
    setVt({ k, x: (size.w - layout.width * k) / 2, y: Math.max(12, (size.h - layout.height * k) / 2) });
  }, [layout, size.w, size.h]);

  // Fit once the drawing is ready (and after the panel is first measured).
  const fitted = useRef(false);
  useEffect(() => {
    if (layout && !fitted.current && size.w > 50) {
      fitted.current = true;
      fit();
    }
  }, [layout, size.w, fit]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setVt((v) => {
      if (!v) return v;
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  }, []);

  // Wheel: scroll to pan; Ctrl/Cmd + wheel (or a trackpad pinch) to zoom, as in Quartus.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
      else {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        setVt((v) => (v ? { ...v, x: v.x - dx, y: v.y - dy } : v));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !vt) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: vt.x, vy: vt.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    d.moved = true;
    setVt((v) => (v ? { ...v, x: d.vx + dx, y: d.vy + dy } : v));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
    }
  };
  const suppressClick = useRef(false);

  const nodeById = useMemo(() => new Map(view.nodes.map((n) => [n.id, n])), [view]);

  const handlers = useMemo(() => {
    const goTo = (src?: { file: string; line: number }) => src && void openFile(src.file, src.line);
    return {
      clickEdge(e: RtlEdge) {
        if (suppressClick.current) return;
        if (e.source.startsWith('k')) {
          const src = nodeById.get(e.source)!;
          setSel({ edges: new Set([e.id]), nodes: new Set([e.source, e.target]), pins: new Set([`${e.source}.Y`, `${e.target}.${e.targetPin}`]), text: `${describeNode(src)} (${src.name.split("'")[0]} bits)` });
        } else setSel(selectBits(view, e.bits, netText(view, e.name, e.bits)));
      },
      clickPin(n: RtlNode, p: RtlPin) {
        if (suppressClick.current) return;
        const name = n.shape === 'input' || n.shape === 'output' ? n.detail : view.edges.find((e) => (e.source === n.id && e.sourcePin === p.name) || (e.target === n.id && e.targetPin === p.name))?.name;
        if (p.bits.every((b) => typeof b !== 'number')) {
          const e = view.edges.find((x) => x.target === n.id && x.targetPin === p.name);
          if (e) return handlers.clickEdge(e);
        }
        setSel(selectBits(view, p.bits, `${n.shape === 'input' || n.shape === 'output' ? '' : `${describeNode(n)}, pin ${p.label || p.name}: `}${netText(view, name, p.bits)}`));
      },
      clickNode(n: RtlNode) {
        if (suppressClick.current) return;
        const bits = n.pins.flatMap((p) => p.bits);
        const s = selectBits(view, bits, '');
        s.nodes.add(n.id);
        for (const e of view.edges) {
          if (e.source === n.id || e.target === n.id) {
            s.edges.add(e.id);
            s.nodes.add(e.source).add(e.target);
          }
        }
        const where = n.src ? ` · ${n.src.file}:${n.src.line}` : '';
        const hint = n.shape === 'module' ? ' · double-click to open it' : n.src ? ' · double-click to go to the source' : '';
        s.text = `${describeNode(n)}${where}${hint}`;
        setSel(s);
      },
      openNode(n: RtlNode) {
        if (n.shape === 'module' && n.module) onOpenModule(n.name);
        else goTo(n.src);
      },
      openEdge(e: RtlEdge) {
        goTo(e.src);
      },
      menuNode(ev: ReactMouseEvent, n: RtlNode) {
        const items: ContextMenuItem[] = [];
        if (n.shape === 'module' && n.module) items.push({ label: 'Open Inside', action: () => onOpenModule(n.name), testId: 'ctx-rtl-open' });
        items.push({ label: 'Go to Source', action: () => goTo(n.src), enabled: !!n.src, testId: 'ctx-rtl-source' });
        showMenu(ev, items);
      },
    };
  }, [view, nodeById, onOpenModule, showMenu]);

  // Keyboard: F fits, + and - zoom, Escape clears the selection.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'f' || e.key === 'F') fit();
    else if (e.key === '+' || e.key === '=') zoomAt(1.25, size.w / 2, size.h / 2);
    else if (e.key === '-') zoomAt(0.8, size.w / 2, size.h / 2);
    else if (e.key === 'Escape') setSel(null);
  };

  return (
    <div className="rtl-canvas-wrap">
      <div
        ref={ref}
        className="rtl-canvas"
        tabIndex={0}
        data-testid="rtl-canvas"
        data-module={view.name}
        data-ready={layout && vt ? '1' : '0'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        onClick={(e) => {
          if (!suppressClick.current && e.target === e.currentTarget.querySelector('svg')) setSel(null);
        }}
      >
        {!layout && <div className="empty">Laying out {view.displayName}...</div>}
        {layout && vt && (
          <svg width="100%" height="100%">
            <g transform={`translate(${vt.x},${vt.y}) scale(${vt.k})`}>
              <Drawing view={view} layout={layout} sel={sel} handlers={handlers} />
            </g>
          </svg>
        )}
        <div className="rtl-zoom">
          <button className="btn small" onClick={() => zoomAt(0.8, size.w / 2, size.h / 2)} data-testid="rtl-zoom-out" title="Zoom out (-)">
            −
          </button>
          <span className="mono rtl-zoom-value" data-testid="rtl-zoom-value">
            {vt ? `${Math.round(vt.k * 100)}%` : ''}
          </span>
          <button className="btn small" onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)} data-testid="rtl-zoom-in" title="Zoom in (+)">
            +
          </button>
          <button className="btn small" onClick={fit} data-testid="rtl-fit" title="Fit to window (F)">
            Fit
          </button>
        </div>
      </div>
      <div className="rtl-info" data-testid="rtl-info">
        {sel?.text ?? 'Click a wire, pin or block to highlight its connections. Double-click a block to open it. Drag or scroll to move; Ctrl+scroll to zoom.'}
      </div>
      {menu}
    </div>
  );
}

interface Handlers {
  clickEdge(e: RtlEdge): void;
  clickPin(n: RtlNode, p: RtlPin): void;
  clickNode(n: RtlNode): void;
  openNode(n: RtlNode): void;
  openEdge(e: RtlEdge): void;
  menuNode(ev: ReactMouseEvent, n: RtlNode): void;
}

/** The schematic itself; memoised so panning and zooming do not redraw it. */
const Drawing = memo(function Drawing({ view, layout, sel, handlers }: { view: RtlModuleView; layout: RtlLayout; sel: Selection | null; handlers: Handlers }) {
  const cls = (hit: boolean) => (sel ? (hit ? 'rtl-hl' : 'rtl-dim') : '');
  return (
    <>
      <g className="rtl-edges">
        {view.edges.map((e) => {
          const le = layout.edges[e.id];
          if (!le || le.points.length < 2) return null;
          const d = `M${le.points.map((p) => p.join(',')).join(' L')}`;
          const hit = !!sel?.edges.has(e.id);
          return (
            <g
              key={e.id}
              className={`rtl-edge ${e.bits.length > 1 ? 'bus' : ''} ${cls(hit)}`}
              data-testid={`rtl-edge-${e.id}`}
              data-name={e.name ?? ''}
              onClick={(ev) => {
                ev.stopPropagation();
                handlers.clickEdge(e);
              }}
              onDoubleClick={() => handlers.openEdge(e)}
            >
              <title>{e.name ? `${e.name} (${e.bits.length} bit${e.bits.length === 1 ? '' : 's'})` : `${e.bits.length} bit${e.bits.length === 1 ? '' : 's'}`}</title>
              <path className="rtl-wire-hit" d={d} />
              <path className="rtl-wire" d={d} />
              {le.junctions.map(([x, y], i) => (
                <circle key={i} className="rtl-junction" cx={x} cy={y} r={2.2} />
              ))}
            </g>
          );
        })}
      </g>
      <g className="rtl-labels">
        {view.edges.map((e) => {
          const l = layout.edges[e.id]?.label;
          if (!l) return null;
          return (
            <g key={e.id} className={cls(!!sel?.edges.has(e.id))} pointerEvents="none">
              <rect className="rtl-label-bg" x={l.x - 1} y={l.y} width={l.width + 2} height={l.height} />
              <text className="rtl-label" x={l.x + 1} y={l.y + l.height - 3}>
                {l.text}
              </text>
            </g>
          );
        })}
      </g>
      <g className="rtl-nodes">
        {view.nodes.map((n) => {
          const p = layout.nodes[n.id];
          if (!p) return null;
          const hit = !!sel?.nodes.has(n.id);
          return (
            <g
              key={n.id}
              transform={`translate(${p.x},${p.y})`}
              className={`rtl-node ${n.shape} ${cls(hit)}`}
              data-testid={`rtl-node-${n.shape === 'module' || n.shape === 'input' || n.shape === 'output' || n.shape === 'register' ? n.name : n.id}`}
              data-shape={n.shape}
              onClick={(ev) => {
                ev.stopPropagation();
                handlers.clickNode(n);
              }}
              onDoubleClick={(ev) => {
                ev.stopPropagation();
                handlers.openNode(n);
              }}
              onContextMenu={(ev) => handlers.menuNode(ev, n)}
            >
              <title>{`${describeNode(n)}${n.src ? `\n${n.src.file}:${n.src.line}` : ''}`}</title>
              <RtlSymbol node={n} />
              {n.pins.map((pin) => (
                <g key={pin.name}>
                  {sel?.pins.has(pinKey(n, pin)) && <circle className="rtl-pin-hl" cx={pin.x} cy={pin.y} r={2.6} />}
                  <circle
                    className="rtl-pin-hit"
                    cx={pin.x}
                    cy={pin.y}
                    r={5}
                    data-testid={`rtl-pin-${n.id}-${pin.name}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      handlers.clickPin(n, pin);
                    }}
                  />
                </g>
              ))}
            </g>
          );
        })}
      </g>
    </>
  );
});
