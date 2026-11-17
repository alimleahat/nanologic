// Black-and-white schematic symbols for the RTL Viewer, drawn in the node's
// own coordinates (pins at the positions given by the netlist).
import { memo } from 'react';
import type { RtlNode, RtlPin } from '@shared/rtl/netlist';

const BUBBLE = 3;

/** x of the OR/XOR back curve at height y (a quadratic from (0,0) via (k,h/2) to (0,h)). */
function orBack(y: number, h: number, k: number): number {
  const t = Math.min(1, Math.max(0, y / h));
  return 2 * t * (1 - t) * k;
}

function GateBody({ node }: { node: RtlNode }) {
  const { width: w, height: h, shape } = node;
  const out = node.pins.find((p) => p.dir === 'out');
  // A NOT gate always has its bubble; other gates have one when the output is inverted.
  const negY = !!out?.negated || shape === 'not';
  const bw = negY ? w - 2 * BUBBLE : w;
  const ins = node.pins.filter((p) => p.dir === 'in');
  const parts: React.ReactNode[] = [];
  if (shape === 'and') {
    const r = Math.min(h / 2, bw * 0.6);
    parts.push(<path key="b" className="rtl-body" d={`M0,0 H${bw - r} A${r},${h / 2} 0 0 1 ${bw - r},${h} H0 Z`} />);
  } else if (shape === 'or' || shape === 'xor') {
    const x0 = shape === 'xor' ? 6 : 0;
    const k = (bw - x0) * 0.3;
    parts.push(
      <path
        key="b"
        className="rtl-body"
        d={`M${x0},0 Q${x0 + (bw - x0) * 0.65},0 ${bw},${h / 2} Q${x0 + (bw - x0) * 0.65},${h} ${x0},${h} Q${x0 + k},${h / 2} ${x0},0 Z`}
      />,
    );
    if (shape === 'xor') parts.push(<path key="x" className="rtl-line" d={`M0,0 Q${k},${h / 2} 0,${h}`} />);
    // Input stubs reach the curved back.
    for (const p of ins) {
      const xb = x0 + orBack(p.y, h, k);
      if (xb > 0.5) parts.push(<line key={`s${p.name}`} className="rtl-line" x1={0} y1={p.y} x2={xb} y2={p.y} />);
    }
  } else {
    // not / buf: a triangle.
    parts.push(<path key="b" className="rtl-body" d={`M0,0 L${bw},${h / 2} L0,${h} Z`} />);
  }
  if (negY) parts.push(<circle key="n" className="rtl-body" cx={w - BUBBLE} cy={h / 2} r={BUBBLE} />);
  if (node.detail) {
    parts.push(
      <text key="t" className="rtl-op-small" x={shape === 'not' || shape === 'buf' ? bw * 0.32 : bw * 0.42} y={h / 2 + 3} textAnchor="middle">
        {node.detail}
      </text>,
    );
  }
  return <>{parts}</>;
}

function PinLabels({ node, inset = 5 }: { node: RtlNode; inset?: number }) {
  return (
    <>
      {node.pins.map((p) =>
        p.label && (p.side === 'W' || p.side === 'E') ? (
          <text
            key={p.name}
            className="rtl-pin-label"
            x={p.side === 'W' ? inset + (p.clock ? 6 : 0) : node.width - inset}
            y={p.y + 3}
            textAnchor={p.side === 'W' ? 'start' : 'end'}
          >
            {p.label}
          </text>
        ) : null,
      )}
    </>
  );
}

/** Clock triangles and inverting bubbles on the pins of boxes. */
function PinMarks({ node }: { node: RtlNode }) {
  return (
    <>
      {node.pins.map((p) => (
        <g key={p.name}>
          {p.clock && <polyline className="rtl-line" points={`0,${p.y - 4} 6,${p.y} 0,${p.y + 4}`} />}
          {p.negated && p.side === 'W' && <circle className="rtl-body" cx={-BUBBLE} cy={p.y} r={BUBBLE} />}
        </g>
      ))}
    </>
  );
}

function Body({ node }: { node: RtlNode }) {
  const { width: w, height: h } = node;
  switch (node.shape) {
    case 'and':
    case 'or':
    case 'xor':
    case 'not':
    case 'buf':
      return <GateBody node={node} />;
    case 'mux': {
      const s = node.pins.find((p) => p.name === 'S');
      return (
        <>
          <polygon className="rtl-body" points={`0,0 ${w},10 ${w},${h - 10} 0,${h}`} />
          {s && <line className="rtl-line" x1={s.x} y1={h - (s.x / w) * 10} x2={s.x} y2={h} />}
          {node.pins
            .filter((p) => p.dir === 'in' && p.side === 'W')
            .map((p) => (
              <text key={p.name} className="rtl-pin-label small" x={3} y={p.y + 3}>
                {p.label}
              </text>
            ))}
          {node.detail && (
            <text className="rtl-pin-label small" x={w / 2 + 2} y={h - 14} textAnchor="middle">
              {node.detail}
            </text>
          )}
        </>
      );
    }
    case 'register':
    case 'latch':
      return (
        <>
          <rect className="rtl-body" width={w} height={h} />
          <text className="rtl-name" x={w / 2} y={12} textAnchor="middle">
            {node.name}
          </text>
          <PinLabels node={node} />
          {node.shape === 'latch' && (
            <text className="rtl-pin-label small" x={w - 5} y={h - 5} textAnchor="end">
              latch
            </text>
          )}
        </>
      );
    case 'op':
      return (
        <>
          <rect className="rtl-body" width={w} height={h} rx={6} />
          <text className="rtl-op" x={w / 2 + 3} y={h / 2 + 5} textAnchor="middle">
            {node.detail}
          </text>
          <PinLabels node={node} inset={4} />
        </>
      );
    case 'module':
      return (
        <>
          <rect className="rtl-body rtl-module" width={w} height={h} />
          <text className="rtl-name" x={w / 2} y={14} textAnchor="middle">
            {node.name}
          </text>
          <text className="rtl-detail" x={w / 2} y={27} textAnchor="middle">
            {node.detail}
          </text>
          <line className="rtl-line faint" x1={0} y1={33} x2={w} y2={33} />
          <PinLabels node={node} />
        </>
      );
    case 'input':
      return (
        <>
          <path className="rtl-body" d={`M0,0 H${w - 8} L${w},10 L${w - 8},20 H0 Z`} />
          <text className="rtl-io" x={6} y={14}>
            {node.detail}
          </text>
        </>
      );
    case 'output':
      return (
        <>
          <path className="rtl-body" d={`M0,0 H${w - 8} L${w},10 L${w - 8},20 H0 L8,10 Z`} />
          <text className="rtl-io" x={12} y={14}>
            {node.detail}
          </text>
        </>
      );
    case 'const':
      return (
        <>
          <rect className="rtl-const" width={w} height={h} rx={2} />
          <text className="rtl-io" x={w / 2} y={h / 2 + 3.5} textAnchor="middle">
            {node.name}
          </text>
        </>
      );
    default:
      return (
        <>
          <rect className="rtl-body" width={w} height={h} />
          <text className="rtl-name" x={w / 2} y={13} textAnchor="middle">
            {node.detail}
          </text>
          <PinLabels node={node} />
        </>
      );
  }
}

export const RtlSymbol = memo(function RtlSymbol({ node }: { node: RtlNode }) {
  return (
    <>
      <Body node={node} />
      <PinMarks node={node} />
    </>
  );
});

/** A short description for the info bar. */
export function describeNode(node: RtlNode): string {
  const op: Record<string, string> = {
    $add: 'Adder',
    $sub: 'Subtractor',
    $mul: 'Multiplier',
    $eq: 'Equality comparator',
    $ne: 'Inequality comparator',
    $lt: 'Less-than comparator',
    $le: 'Less-or-equal comparator',
    $gt: 'Greater-than comparator',
    $ge: 'Greater-or-equal comparator',
    $shl: 'Left shift',
    $shr: 'Right shift',
  };
  const gate = (n: string) => `${n} gate${node.name ? ` ${node.name}` : ''}`;
  switch (node.shape) {
    case 'module':
      return `Instance ${node.name} of ${node.detail}`;
    case 'register':
      return `Register ${node.name}${node.pins.find((p) => p.name === 'Q')?.bits.length === 1 ? '' : ` (${node.pins.find((p) => p.name === 'Q')?.bits.length} bits)`}`;
    case 'latch':
      return `Latch ${node.name}`;
    case 'mux':
      return node.type === '$pmux' ? 'Multiplexer (case statement)' : 'Multiplexer';
    case 'op':
      return op[node.type] ?? `Operator ${node.detail}`;
    case 'and':
      return gate(node.pins.some((p) => p.dir === 'out' && p.negated) ? 'NAND' : node.type === '$logic_and' ? 'Logical AND' : 'AND');
    case 'or':
      return gate(node.pins.some((p) => p.dir === 'out' && p.negated) ? 'NOR' : node.type === '$logic_or' ? 'Logical OR' : 'OR');
    case 'xor':
      return gate(node.pins.some((p) => p.dir === 'out' && p.negated) ? 'XNOR' : 'XOR');
    case 'not':
      return gate(node.type === '$logic_not' ? 'Logical NOT' : 'NOT');
    case 'buf':
      return 'Buffer';
    case 'input':
      return `Input ${node.detail}`;
    case 'output':
      return `Output ${node.detail}`;
    case 'const':
      return `Constant ${node.name}`;
    default:
      return `${node.detail ?? node.type}${node.name ? ` ${node.name}` : ''}`;
  }
}

export function pinKey(node: RtlNode, pin: RtlPin): string {
  return `${node.id}.${pin.name}`;
}
