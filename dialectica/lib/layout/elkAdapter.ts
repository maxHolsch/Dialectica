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

import { execFile } from "child_process";
import { resolve } from "path";
import type { HandleId } from "@/lib/schema";
import type { LayoutStrategyId } from "./strategies";
import { LAYOUT_STRATEGIES } from "./strategies";

// Run ELK in a child process to avoid blocking the Next.js event loop.
// child_process.execFile is completely outside webpack/bundler scope, so
// ELK's fake-worker message loop works correctly with plain require().
function runElkInWorker(graph: unknown): Promise<ElkRootOut> {
  return new Promise((res, rej) => {
    const scriptPath = resolve(process.cwd(), "lib/layout/elk-worker.cjs");
    const child = execFile(
      "node",
      [scriptPath],
      { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) { rej(new Error(`ELK child: ${error.message} — ${stderr}`)); return; }
        try { res(JSON.parse(stdout) as ElkRootOut); }
        catch (e) { rej(new Error(`ELK parse failed: ${stderr}`)); }
      },
    );
    child.stdin?.write(JSON.stringify(graph));
    child.stdin?.end();
  });
}

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
export const SLOTS_PER_SIDE = 1;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Pick the source + target sides for one edge as a COUPLED pair that always
 * produces a direct (0-kink straight line) connection from the center of one
 * side to the center of the opposite side:
 *
 *   |dy| >= |dx|  →  bottom→top  (or top→bottom for upward edges)
 *   |dx| >  |dy|  →  right→left  (or left→right for leftward edges)
 *
 * Diagonal edges always use the dominant axis so the path is a straight line
 * between side-centers rather than an L-shaped bezier that appears to emerge
 * from a corner.
 */
function chooseSides(
  src: { x: number; y: number; width: number; height: number },
  tgt: { x: number; y: number; width: number; height: number },
  flowHint?: "down" | "right",
): { srcSide: Side; tgtSide: Side } {
  const dx = (tgt.x + tgt.width / 2) - (src.x + src.width / 2);
  const dy = (tgt.y + tgt.height / 2) - (src.y + src.height / 2);
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy >= 0
      ? { srcSide: "bottom", tgtSide: "top" }
      : { srcSide: "top", tgtSide: "bottom" };
  }
  return dx > 0
    ? { srcSide: "right", tgtSide: "left" }
    : { srcSide: "left", tgtSide: "right" };
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
 * Uses a center-first distribution: edges always prefer the center slot and
 * expand outward symmetrically only as needed. This keeps edges close to the
 * middle of each node face — the "clean center entry" look.
 *
 *   1 edge  → [50%]
 *   2 edges → [30%, 70%]
 *   3 edges → [30%, 50%, 70%]
 *   4 edges → [10%, 30%, 70%, 90%]
 *   5 edges → [10%, 30%, 50%, 70%, 90%]
 */
function assignSlots(
  group: Array<{ edgeId: string; offset: number }>,
): Map<string, number> {
  const out = new Map<string, number>();
  if (group.length === 0) return out;
  group.sort((a, b) => a.offset - b.offset);

  // Build center-out slot list for up to SLOTS_PER_SIDE edges.
  const center = Math.floor(SLOTS_PER_SIDE / 2);
  const centerOut: number[] = [];
  if (group.length % 2 === 1) centerOut.push(center);
  for (let d = 1; centerOut.length < Math.min(group.length, SLOTS_PER_SIDE); d++) {
    if (center - d >= 0) centerOut.push(center - d);
    if (centerOut.length < Math.min(group.length, SLOTS_PER_SIDE) && center + d < SLOTS_PER_SIDE) {
      centerOut.push(center + d);
    }
  }
  const slots = centerOut.slice(0, group.length).sort((a, b) => a - b);

  if (group.length <= SLOTS_PER_SIDE) {
    for (let i = 0; i < group.length; i++) {
      out.set(group[i].edgeId, slots[i]);
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
 *
 * `flowHint` — pass "down" for layered-down layouts so diagonal edges
 * always enter the target from the top (not left/right), keeping the
 * downward-flow visual clean.
 */
function assignClosestSideHandles(
  nodes: LaidOutNode[],
  edges: Array<{ id: string; source: string; target: string }>,
  flowHint?: "down" | "right",
): Map<string, { sourceHandle: HandleId; targetHandle: HandleId }> {
  const nodeById = new Map<string, LaidOutNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  // Pass 1: each edge picks a COUPLED (srcSide, tgtSide) pair that minimises
  // smoothstep kinks, then computes the natural slot offset along each side.
  const infos: EdgeSideInfo[] = [];
  for (const e of edges) {
    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    if (!s || !t) continue;
    const sCx = s.x + s.width / 2;
    const sCy = s.y + s.height / 2;
    const tCx = t.x + t.width / 2;
    const tCy = t.y + t.height / 2;
    const { srcSide, tgtSide } = chooseSides(s, t, flowHint);
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
    const sSlot = srcSlotByEdge.get(info.edgeId) ?? 0;
    const tSlot = tgtSlotByEdge.get(info.edgeId) ?? 0;
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
  elkOptionsOverride?: Record<string, string>,
): Promise<LaidOut | null> {
  if (nodes.length === 0) return null;

  const strategy = LAYOUT_STRATEGIES[strategyId];
  const elkOptions = elkOptionsOverride
    ? { ...strategy.elkOptions, ...elkOptionsOverride }
    : strategy.elkOptions;

  // Filter out edges whose endpoints aren't in the node set; otherwise elk
  // throws "edge references unknown node". This can happen if the pipeline
  // emits a relationship endpoint that didn't make it into the frame.
  const nodeIds = new Set(nodes.map((n) => n.id));
  const safeEdges = edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  );

  const graph = {
    id: "root",
    layoutOptions: elkOptions,
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

  const result = await runElkInWorker(graph);

  const children = result.children ?? [];
  const laidNodes: LaidOutNode[] = children.map((c) => ({
    id: c.id,
    x: c.x ?? 0,
    y: c.y ?? 0,
    width: c.width ?? 0,
    height: c.height ?? 0,
  }));

  // Closest-side + slot assignment over ELK's chosen positions.
  const flowHint = strategyId === "layered-down" ? "down" : strategyId === "layered-right" ? "right" : undefined;
  const handlesByEdge = assignClosestSideHandles(laidNodes, safeEdges, flowHint);

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
