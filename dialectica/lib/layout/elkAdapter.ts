// Thin ELK adapter. Builds a graph from {nodes, edges, label measurements},
// runs elkjs for node positions, then runs our own geometric port-assignment
// pass to choose the CLOSEST sides + distribute edges across SLOTS so multiple
// edges leaving the same side don't stack on one anchor.
//
// Why bypass ELK's edge-side output:
//   ELK's `layered` algorithm forces every outgoing edge through the bottom
//   port and every incoming through the top (or right/left for direction
//   RIGHT) regardless of where the nodes actually end up. That means a tile
//   that sits directly to the right of another would still emit a long
//   ⌐-shaped edge from bottom → top instead of a short straight line from
//   right → left. The fix is to keep ELK's positions but rederive each
//   port geometrically.
//
// The closest-side problem is well-studied: classical port assignment +
// per-side slot ordering. We do the simplest useful variant:
//   1. For each edge, pick the side of each endpoint that the line between
//      centers exits through (accounts for node aspect ratio).
//   2. Group edges by (nodeId, side, direction) and sort each group by the
//      perpendicular-axis position of the OTHER endpoint, then evenly
//      distribute the sorted edges across SLOTS_PER_SIDE handle slots. This
//      keeps edges in the same order ELK gave us so crossings stay minimal
//      AND lets multiple edges leave one side from distinct anchor points.
//
// elkjs is loaded via dynamic import so it never bloats the main client
// bundle (relevant for the AUTO-FORMAT button) and to dodge any subtle
// Workflow-step bundling weirdness in production builds.

import type { HandleId } from "@/lib/schema";
import type { LayoutStrategyId } from "./strategies";
import { LAYOUT_STRATEGIES } from "./strategies";

export type ElkNodeIn = {
  id: string;
  width: number;
  height: number;
};

export type ElkEdgeIn = {
  id: string;
  source: string;
  target: string;
  /** Pre-measured label box, if the edge has a label. */
  label?: { text: string; width: number; height: number };
};

export type LaidOutNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LaidOutEdge = {
  id: string;
  sourceHandle: HandleId;
  targetHandle: HandleId;
};

export type LaidOut = {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  bbox: { width: number; height: number };
};

type ElkChild = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type ElkEdgeOut = {
  id: string;
  sources: string[];
  targets: string[];
};

type ElkRootOut = {
  width?: number;
  height?: number;
  children?: ElkChild[];
  edges?: ElkEdgeOut[];
};

type Side = "top" | "bottom" | "left" | "right";

/** Number of handle slots rendered per side per direction (src + tgt). */
export const SLOTS_PER_SIDE = 5;

/**
 * Direction the ray (dx, dy) leaves the centred rectangle through. Uses the
 * smaller intersection-time t along the ray against the box's half-extents,
 * so aspect-ratio is honoured: a wide-short node connecting to a node
 * directly above it picks "top", not "right".
 */
function exitSide(
  box: { width: number; height: number },
  dx: number,
  dy: number,
): Side {
  if (dx === 0 && dy === 0) return "right";
  const tx = dx === 0 ? Infinity : box.width / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : box.height / 2 / Math.abs(dy);
  if (tx <= ty) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Where along its chosen side does this edge naturally want to attach? */
function offsetAlongSide(
  side: Side,
  ownBox: LaidOutNode,
  otherCx: number,
  otherCy: number,
): number {
  // top/bottom run horizontally — the natural offset is the other node's x
  // relative to this node's left edge. left/right run vertically — use y.
  if (side === "top" || side === "bottom") {
    return clamp((otherCx - ownBox.x) / ownBox.width, 0, 1);
  }
  return clamp((otherCy - ownBox.y) / ownBox.height, 0, 1);
}

type EdgeSideInfo = {
  edgeId: string;
  sourceId: string;
  targetId: string;
  srcSide: Side;
  tgtSide: Side;
  srcOffset: number;
  tgtOffset: number;
};

/**
 * Distribute the edges in `group` across SLOTS_PER_SIDE slots on the same
 * side. Sorted by natural offset so the visual order matches geometry and
 * crossings stay minimal.
 *
 * If 1 edge: snap to the slot nearest the natural offset (so a single edge
 * still points at its target rather than always landing in the middle).
 * If >1 edges: spread evenly across [0..N-1], preserving the sort order.
 * If >N edges: some slots will carry more than one edge — unavoidable, but
 * still better than every edge stacking on a single anchor.
 */
function assignSlots(
  group: Array<{ edgeId: string; offset: number }>,
): Map<string, number> {
  const out = new Map<string, number>();
  if (group.length === 0) return out;
  group.sort((a, b) => a.offset - b.offset);
  if (group.length === 1) {
    const e = group[0];
    out.set(
      e.edgeId,
      clamp(Math.floor(e.offset * SLOTS_PER_SIDE), 0, SLOTS_PER_SIDE - 1),
    );
    return out;
  }
  if (group.length <= SLOTS_PER_SIDE) {
    // Spread evenly across all available slots.
    for (let i = 0; i < group.length; i++) {
      const slot = Math.round((i * (SLOTS_PER_SIDE - 1)) / (group.length - 1));
      out.set(group[i].edgeId, slot);
    }
  } else {
    // More edges than slots — bucket into the N available positions.
    for (let i = 0; i < group.length; i++) {
      const slot = Math.min(
        SLOTS_PER_SIDE - 1,
        Math.floor((i * SLOTS_PER_SIDE) / group.length),
      );
      out.set(group[i].edgeId, slot);
    }
  }
  return out;
}

/**
 * Geometric port assignment over ELK's positioned nodes. For each edge:
 *   sourceHandle = `src-${side}-${slot}`  — chosen by closest-exit geometry
 *   targetHandle = `tgt-${side}-${slot}`  — same, from the target's POV
 *
 * Slots distribute edges that share a (node, side) so they don't stack.
 */
function assignClosestSideHandles(
  nodes: LaidOutNode[],
  edges: Array<{ id: string; source: string; target: string }>,
): Map<string, { sourceHandle: HandleId; targetHandle: HandleId }> {
  const nodeById = new Map<string, LaidOutNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  // Pass 1: each edge picks closest sides and computes natural offsets.
  const infos: EdgeSideInfo[] = [];
  for (const e of edges) {
    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    if (!s || !t) continue;
    const sCx = s.x + s.width / 2;
    const sCy = s.y + s.height / 2;
    const tCx = t.x + t.width / 2;
    const tCy = t.y + t.height / 2;
    const dx = tCx - sCx;
    const dy = tCy - sCy;
    const srcSide = exitSide(s, dx, dy);
    const tgtSide = exitSide(t, -dx, -dy);
    infos.push({
      edgeId: e.id,
      sourceId: e.source,
      targetId: e.target,
      srcSide,
      tgtSide,
      srcOffset: offsetAlongSide(srcSide, s, tCx, tCy),
      tgtOffset: offsetAlongSide(tgtSide, t, sCx, sCy),
    });
  }

  // Pass 2: group by (node, side, direction) and assign slots.
  const srcGroups = new Map<
    string,
    Array<{ edgeId: string; offset: number }>
  >();
  const tgtGroups = new Map<
    string,
    Array<{ edgeId: string; offset: number }>
  >();
  for (const info of infos) {
    const sKey = `${info.sourceId}:${info.srcSide}`;
    const tKey = `${info.targetId}:${info.tgtSide}`;
    if (!srcGroups.has(sKey)) srcGroups.set(sKey, []);
    if (!tgtGroups.has(tKey)) tgtGroups.set(tKey, []);
    srcGroups.get(sKey)!.push({ edgeId: info.edgeId, offset: info.srcOffset });
    tgtGroups.get(tKey)!.push({ edgeId: info.edgeId, offset: info.tgtOffset });
  }

  const srcSlotByEdge = new Map<string, number>();
  for (const group of srcGroups.values()) {
    for (const [edgeId, slot] of assignSlots(group)) {
      srcSlotByEdge.set(edgeId, slot);
    }
  }
  const tgtSlotByEdge = new Map<string, number>();
  for (const group of tgtGroups.values()) {
    for (const [edgeId, slot] of assignSlots(group)) {
      tgtSlotByEdge.set(edgeId, slot);
    }
  }

  const out = new Map<
    string,
    { sourceHandle: HandleId; targetHandle: HandleId }
  >();
  for (const info of infos) {
    const sSlot = srcSlotByEdge.get(info.edgeId) ?? 2;
    const tSlot = tgtSlotByEdge.get(info.edgeId) ?? 2;
    out.set(info.edgeId, {
      sourceHandle: `src-${info.srcSide}-${sSlot}` as HandleId,
      targetHandle: `tgt-${info.tgtSide}-${tSlot}` as HandleId,
    });
  }
  return out;
}

/**
 * Lay out a single graph (crux subgraph or one frame's subgraph).
 *
 * @returns positions for every node and chosen source/target sides for every
 *   edge. Returns null when the graph has zero nodes.
 */
export async function runElkLayout(
  nodes: ElkNodeIn[],
  edges: ElkEdgeIn[],
  strategyId: LayoutStrategyId,
): Promise<LaidOut | null> {
  if (nodes.length === 0) return null;

  // elkjs ships a CommonJS bundle whose default export is the constructor.
  // Dynamic import keeps it out of the main browser bundle and works in Node
  // (workflow step) and the browser identically.
  const mod = (await import("elkjs/lib/elk.bundled.js")) as unknown as {
    default: new () => {
      layout: (graph: unknown) => Promise<unknown>;
    };
  };
  const ElkCtor = mod.default;
  const elk = new ElkCtor();

  const strategy = LAYOUT_STRATEGIES[strategyId];

  // Filter out edges whose endpoints aren't in the node set; otherwise elk
  // throws "edge references unknown node". This can happen if the pipeline
  // emits a relationship endpoint that didn't make it into the frame.
  const nodeIds = new Set(nodes.map((n) => n.id));
  const safeEdges = edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  );

  const graph = {
    id: "root",
    layoutOptions: strategy.elkOptions,
    children: nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
    })),
    edges: safeEdges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
      labels: e.label
        ? [
            {
              text: e.label.text,
              width: e.label.width,
              height: e.label.height,
            },
          ]
        : undefined,
    })),
  };

  const result = (await elk.layout(graph)) as ElkRootOut;

  const children = result.children ?? [];
  const laidNodes: LaidOutNode[] = children.map((c) => ({
    id: c.id,
    x: c.x ?? 0,
    y: c.y ?? 0,
    width: c.width ?? 0,
    height: c.height ?? 0,
  }));

  // Closest-side + slot assignment over ELK's chosen positions.
  const handlesByEdge = assignClosestSideHandles(laidNodes, safeEdges);

  const laidEdges: LaidOutEdge[] = [];
  for (const edge of result.edges ?? []) {
    const handles = handlesByEdge.get(edge.id);
    if (!handles) continue;
    laidEdges.push({
      id: edge.id,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
    });
  }

  return {
    nodes: laidNodes,
    edges: laidEdges,
    bbox: { width: result.width ?? 0, height: result.height ?? 0 },
  };
}
