// Places the symbols of one RTL view with ELK's layered algorithm (left to
// right, inputs first, outputs last, orthogonal wires). The ELK instance is
// passed in: a web worker in the app, the bundled build in unit tests.
import type { ELK, ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import type { RtlModuleView } from './netlist';

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
}

export interface LaidOutEdge {
  id: string;
  /** Polyline from the driver pin to the load pin. */
  points: [number, number][];
  junctions: [number, number][];
  label?: { x: number; y: number; width: number; height: number; text: string };
}

export interface RtlLayout {
  width: number;
  height: number;
  nodes: Record<string, LaidOutNode>;
  edges: Record<string, LaidOutEdge>;
}

export const LABEL_CHAR = 6;
export const LABEL_HEIGHT = 12;

const SIDE = { W: 'WEST', E: 'EAST', S: 'SOUTH', N: 'NORTH' } as const;

export function toElkGraph(view: RtlModuleView): ElkNode {
  const big = view.nodes.length > 150;
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
      'elk.spacing.nodeNode': '22',
      'elk.spacing.edgeEdge': '8',
      'elk.spacing.edgeNode': '12',
      'elk.spacing.edgeLabel': '2',
      'elk.layered.spacing.nodeNodeBetweenLayers': '36',
      'elk.layered.spacing.edgeNodeBetweenLayers': '14',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '8',
      'elk.layered.feedbackEdges': 'true',
      'elk.layered.nodePlacement.strategy': big ? 'BRANDES_KOEPF' : 'NETWORK_SIMPLEX',
      'elk.layered.thoroughness': big ? '3' : '7',
      'elk.edgeLabels.inline': 'true',
      'elk.layered.edgeLabels.sideSelection': 'ALWAYS_UP',
    },
    children: view.nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
      layoutOptions: {
        'elk.portConstraints': 'FIXED_POS',
        ...(n.shape === 'input' ? { 'elk.layered.layering.layerConstraint': 'FIRST' } : {}),
        ...(n.shape === 'output' ? { 'elk.layered.layering.layerConstraint': 'LAST' } : {}),
      },
      ports: n.pins.map((p) => ({
        id: `${n.id}.${p.name}`,
        x: p.x,
        y: p.y,
        width: 0,
        height: 0,
        layoutOptions: { 'elk.port.side': SIDE[p.side] },
      })),
    })),
    edges: view.edges.map(
      (e): ElkExtendedEdge => ({
        id: e.id,
        sources: [`${e.source}.${e.sourcePin}`],
        targets: [`${e.target}.${e.targetPin}`],
        labels:
          e.showLabel && e.name
            ? [{ id: `${e.id}.label`, text: e.name, width: e.name.length * LABEL_CHAR + 4, height: LABEL_HEIGHT, layoutOptions: { 'elk.edgeLabels.placement': 'CENTER' } }]
            : [],
      }),
    ),
  };
}

export function fromElkGraph(view: RtlModuleView, g: ElkNode): RtlLayout {
  const nodes: Record<string, LaidOutNode> = {};
  for (const c of g.children ?? []) nodes[c.id] = { id: c.id, x: c.x ?? 0, y: c.y ?? 0 };
  const edges: Record<string, LaidOutEdge> = {};
  for (const e of (g.edges ?? []) as ElkExtendedEdge[]) {
    const points: [number, number][] = [];
    for (const s of e.sections ?? []) {
      points.push([s.startPoint.x, s.startPoint.y]);
      for (const b of s.bendPoints ?? []) points.push([b.x, b.y]);
      points.push([s.endPoint.x, s.endPoint.y]);
    }
    const l = e.labels?.[0];
    edges[e.id] = {
      id: e.id,
      points,
      junctions: (e.junctionPoints ?? []).map((p) => [p.x, p.y]),
      label: l && l.text ? { x: l.x ?? 0, y: l.y ?? 0, width: l.width ?? 0, height: l.height ?? 0, text: l.text } : undefined,
    };
  }
  // Wires the layout could not route (should not happen) fall back to a straight line.
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  for (const e of view.edges) {
    if (edges[e.id]?.points.length) continue;
    const s = byId.get(e.source)!;
    const t = byId.get(e.target)!;
    const sp = s.pins.find((p) => p.name === e.sourcePin)!;
    const tp = t.pins.find((p) => p.name === e.targetPin)!;
    edges[e.id] = {
      id: e.id,
      points: [
        [nodes[s.id].x + sp.x, nodes[s.id].y + sp.y],
        [nodes[t.id].x + tp.x, nodes[t.id].y + tp.y],
      ],
      junctions: [],
    };
  }
  return { width: g.width ?? 0, height: g.height ?? 0, nodes, edges };
}

export async function layoutModule(elk: Pick<ELK, 'layout'>, view: RtlModuleView): Promise<RtlLayout> {
  return fromElkGraph(view, await elk.layout(toElkGraph(view)));
}
