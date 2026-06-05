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

// Top-left origin for frame subgraphs (ELK positions are relative).
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

  // ───── 1. Crux tiles: manual ring layout ─────
  // The top question is rendered as a fixed header, not a canvas node, so it
  // is excluded from the crux layout entirely. Crux tiles have no edges between
  // them, so we compute a grid layout manually instead of using ELK.
  // Tiles are arranged left-to-right, top-to-bottom in ~sqrt(n) columns;
  // the last row is centered if it is not full.
  const topMeasured = measureWrappedText(map.topQuestion, TOP_QUESTION_FONT);
  const topSize = map.topQuestionSize ?? topMeasured;

  // CruxTileNode renders as a circle: width = height = max(measured_width, 220).
  // Store square sizes so ReactFlow reports the correct node bounds.
  const MIN_TILE = 220;
  const cruxSizes = new Map<string, { width: number; height: number }>();
  for (const c of map.cruxes) {
    const m = measureWrappedText(c.question, CRUX_TILE_FONT);
    const d = Math.max(m.width, MIN_TILE);
    cruxSizes.set(c.id, { width: d, height: d });
  }

  const TILE_GAP = 48;
  const n = map.cruxes.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const tileD = map.cruxes.reduce((m, c) => Math.max(m, cruxSizes.get(c.id)!.width), 0);
  const cell = tileD + TILE_GAP;
  const gridW = cols * cell - TILE_GAP;
  const gridH = rows * cell - TILE_GAP;

  const GRID_CENTER = { x: 800, y: 540 };
  const startX = GRID_CENTER.x - gridW / 2;
  const startY = GRID_CENTER.y - gridH / 2;

  const cruxPositions = new Map<string, { x: number; y: number }>();
  map.cruxes.forEach((c, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const tilesInRow = row === rows - 1 ? n - row * cols : cols;
    const rowInset = ((cols - tilesInRow) * cell) / 2;
    cruxPositions.set(c.id, {
      x: startX + col * cell + rowInset,
      y: startY + row * cell,
    });
  });

  // cruxEdge handles: only assign if edges exist (legacy maps may have them).
  const cruxEdgeHandles = new Map<
    string,
    { sourceHandle: HandleId; targetHandle: HandleId }
  >();
  if (map.cruxEdges.length > 0) {
    const cruxElkNodes: ElkNodeIn[] = map.cruxes.map((c) => {
      const s = cruxSizes.get(c.id)!;
      return { id: c.id, width: s.width, height: s.height };
    });
    const cruxElkEdges: ElkEdgeIn[] = map.cruxEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: measureLabel(e.label),
    }));
    const cruxLayout = await runElkLayout(cruxElkNodes, cruxElkEdges, strategy);
    if (cruxLayout) {
      for (const e of cruxLayout.edges) {
        cruxEdgeHandles.set(e.id, {
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
        });
      }
    }
  }

  const topPosition = map.topQuestionPosition ?? GRID_CENTER;

  const nextCruxes = map.cruxes.map((c) => ({
    ...c,
    position: cruxPositions.get(c.id) ?? c.position,
    size: cruxSizes.get(c.id) ?? c.size,
  }));

  const nextCruxEdges = applyHandlesToEdges(map.cruxEdges, cruxEdgeHandles);

  log(
    `crux subgraph laid out · ${map.cruxes.length} tiles · ${map.cruxEdges.length} edges`,
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
