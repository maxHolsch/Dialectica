// Auto-format an ArgMap: pick sizes by wrapping text, run ELK on the crux
// subgraph and on every frame independently, write positions / sizes /
// chosen edge handles back. Pure function — caller decides whether to
// persist the result.
//
// Touched fields:
//   - topQuestionPosition, topQuestionSize
//   - each crux.position, crux.size
//   - each cruxEdge.sourceHandle, .targetHandle
//   - each frame.nodeInstances[].position, .size
//   - each frame.edges[].sourceHandle, .targetHandle
//
// Untouched (the user's text + meta content):
//   - nodes[id].text, edge.label, edge.relType, crux.question, topQuestion
//   - annotations, crossLinks, meta, createdAt, id, title

import type { ArgMap, Edge, HandleId } from "@/lib/schema";
import { runElkLayout, type ElkEdgeIn, type ElkNodeIn } from "./elkAdapter";
import { measureWrappedText } from "./measureText";
import {
  DEFAULT_STRATEGY,
  type LayoutStrategyId,
} from "./strategies";

const TOP_SENTINEL = "top";

// Text rendering parameters per node "kind". These mirror the Tailwind classes
// on TopQuestionNode / CruxTileNode / ClaimNode / QuestionNode.
const TOP_QUESTION_FONT = {
  maxWidth: 320,
  minWidth: 200,
  fontSize: 14,
  lineHeight: 1.55,
  paddingX: 32, // px-4 = 16 on each side
  paddingY: 56,
};

const CRUX_TILE_FONT = {
  maxWidth: 320,
  minWidth: 200,
  fontSize: 14,
  lineHeight: 1.55,
  paddingX: 32,
  paddingY: 56,
};

const FRAME_NODE_FONT = {
  maxWidth: 340,
  minWidth: 220,
  fontSize: 16,
  lineHeight: 1.5,
  paddingX: 64, // px-8 = 32 on each side
  paddingY: 64,
};

const EDGE_LABEL_FONT = {
  maxWidth: 220,
  minWidth: 24,
  fontSize: 12,
  lineHeight: 1.4,
  paddingX: 16,
  paddingY: 16,
};

// Top-left anchor for each subgraph in the world. Pick coordinates that match
// what existing pages used so the camera fitView lands somewhere similar.
const CRUX_ORIGIN = { x: 80, y: 80 };
const FRAME_ORIGIN = { x: 80, y: 80 };

function applyHandlesToEdges<E extends Edge>(
  edges: E[],
  byId: Map<string, { sourceHandle: HandleId; targetHandle: HandleId }>,
): E[] {
  return edges.map((e) => {
    const hit = byId.get(e.id);
    if (!hit) return e;
    return { ...e, sourceHandle: hit.sourceHandle, targetHandle: hit.targetHandle };
  });
}

function measureLabel(text: string | undefined) {
  if (!text) return undefined;
  const m = measureWrappedText(text, EDGE_LABEL_FONT);
  return { text, width: m.width, height: m.height };
}

export type AutoFormatLogger = (message: string) => void;

export async function autoFormatArgMap(
  map: ArgMap,
  strategy: LayoutStrategyId = DEFAULT_STRATEGY,
  logger?: AutoFormatLogger,
): Promise<ArgMap> {
  const log = logger ?? (() => {});
  log(`auto-format start · strategy=${strategy}`);

  // ───── 1. Crux subgraph: top question + cruxes + cruxEdges ─────
  const cruxNodeMeasures = new Map<string, { width: number; height: number }>();

  const topMeasured = measureWrappedText(map.topQuestion, TOP_QUESTION_FONT);
  cruxNodeMeasures.set(TOP_SENTINEL, topMeasured);

  for (const c of map.cruxes) {
    cruxNodeMeasures.set(c.id, measureWrappedText(c.question, CRUX_TILE_FONT));
  }

  const cruxElkNodes: ElkNodeIn[] = [
    { id: TOP_SENTINEL, ...topMeasured },
    ...map.cruxes.map((c) => {
      const m = cruxNodeMeasures.get(c.id)!;
      return { id: c.id, width: m.width, height: m.height };
    }),
  ];

  const cruxElkEdges: ElkEdgeIn[] = map.cruxEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: measureLabel(e.label),
  }));

  const cruxLayout = await runElkLayout(cruxElkNodes, cruxElkEdges, strategy);

  // Default to the input positions if the layout couldn't be computed (zero
  // nodes — which shouldn't happen because we always include "top", but be
  // defensive).
  const cruxPositions = new Map<string, { x: number; y: number }>();
  const cruxSizes = new Map<string, { width: number; height: number }>();
  if (cruxLayout) {
    for (const n of cruxLayout.nodes) {
      cruxPositions.set(n.id, {
        x: n.x + CRUX_ORIGIN.x,
        y: n.y + CRUX_ORIGIN.y,
      });
      cruxSizes.set(n.id, { width: n.width, height: n.height });
    }
  }
  const cruxEdgeHandles = new Map<
    string,
    { sourceHandle: HandleId; targetHandle: HandleId }
  >();
  if (cruxLayout) {
    for (const e of cruxLayout.edges) {
      cruxEdgeHandles.set(e.id, {
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      });
    }
  }

  const topPosition =
    cruxPositions.get(TOP_SENTINEL) ?? map.topQuestionPosition;
  const topSize = cruxSizes.get(TOP_SENTINEL) ?? map.topQuestionSize ?? topMeasured;

  const nextCruxes = map.cruxes.map((c) => ({
    ...c,
    position: cruxPositions.get(c.id) ?? c.position,
    size:
      cruxSizes.get(c.id) ??
      c.size ??
      cruxNodeMeasures.get(c.id) ??
      c.size,
  }));

  const nextCruxEdges = applyHandlesToEdges(map.cruxEdges, cruxEdgeHandles);

  log(
    `crux subgraph laid out · ${cruxElkNodes.length} nodes · ${cruxElkEdges.length} edges`,
  );

  // ───── 2. Frames: one ELK pass per frame ─────
  const nextFrames: ArgMap["frames"] = {};
  for (const [frameId, frame] of Object.entries(map.frames)) {
    const frameNodeMeasures = new Map<
      string,
      { width: number; height: number }
    >();
    for (const inst of frame.nodeInstances) {
      const canonical = map.nodes[inst.nodeId];
      const text = canonical?.text ?? "";
      frameNodeMeasures.set(
        inst.nodeId,
        measureWrappedText(text, FRAME_NODE_FONT),
      );
    }

    const frameElkNodes: ElkNodeIn[] = frame.nodeInstances.map((inst) => {
      const m = frameNodeMeasures.get(inst.nodeId)!;
      return { id: inst.nodeId, width: m.width, height: m.height };
    });

    const frameElkEdges: ElkEdgeIn[] = frame.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: measureLabel(e.label),
    }));

    const frameLayout = await runElkLayout(
      frameElkNodes,
      frameElkEdges,
      strategy,
    );

    const positions = new Map<string, { x: number; y: number }>();
    const sizes = new Map<string, { width: number; height: number }>();
    if (frameLayout) {
      for (const n of frameLayout.nodes) {
        positions.set(n.id, {
          x: n.x + FRAME_ORIGIN.x,
          y: n.y + FRAME_ORIGIN.y,
        });
        sizes.set(n.id, { width: n.width, height: n.height });
      }
    }
    const edgeHandles = new Map<
      string,
      { sourceHandle: HandleId; targetHandle: HandleId }
    >();
    if (frameLayout) {
      for (const e of frameLayout.edges) {
        edgeHandles.set(e.id, {
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
        });
      }
    }

    const nextNodeInstances = frame.nodeInstances.map((inst) => ({
      ...inst,
      position: positions.get(inst.nodeId) ?? inst.position,
      size:
        sizes.get(inst.nodeId) ??
        inst.size ??
        frameNodeMeasures.get(inst.nodeId) ??
        inst.size,
    }));

    nextFrames[frameId] = {
      ...frame,
      nodeInstances: nextNodeInstances,
      edges: applyHandlesToEdges(frame.edges, edgeHandles),
    };
  }

  log(`frame subgraphs laid out · ${Object.keys(nextFrames).length} frames`);

  return {
    ...map,
    topQuestionPosition: topPosition,
    topQuestionSize: topSize,
    cruxes: nextCruxes,
    cruxEdges: nextCruxEdges,
    frames: nextFrames,
    updatedAt: new Date().toISOString(),
  };
}
