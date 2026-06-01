"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type NodeMouseHandler,
  type OnNodesChange,
  type NodePositionChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Annotation } from "@/lib/schema";
import { useUIStore } from "@/lib/state/useUIStore";
import { useDrawingHandlers } from "@/lib/canvas/useDrawingHandlers";
import { createAnnotation } from "@/lib/data/mutations";
import { subscribeToAnnotations } from "@/lib/realtime/annotations";
import { stakeKey, type StakeMap } from "@/lib/data/stakes-types";
import { EditToolbar } from "./EditToolbar";
import { StrokeNode } from "./StrokeNode";
import { InFlightStrokeLayer } from "./InFlightStrokeLayer";
import {
  NodeContextMenu,
  type NodeContextMenuState,
} from "@/components/frame/ContextMenu";

/**
 * Shared React Flow canvas used by Crux view (DIA-VIEW-1) and Frame view (DIA-VIEW-2).
 * Phase 3: drawing tools + edit-mode affordances via floating toolbar.
 */
export function CanvasShell({
  nodes,
  edges,
  nodeTypes,
  edgeTypes,
  annotations,
  mapId,
  frameId,
  userId,
  isEditMode,
  onNodeNavigate,
  onAddClaim,
  stakes,
}: {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  edgeTypes?: EdgeTypes;
  annotations: Annotation[];
  mapId: string;
  frameId?: string;
  userId: string;
  isEditMode: boolean;
  onNodeNavigate?: (nodeId: string) => string | null;
  onAddClaim?: () => void;
  /** Frame view only: stake aggregates keyed by `${frameId}::${nodeId}`. */
  stakes?: StakeMap;
}) {
  // Always include the stroke node type alongside whatever the caller passes.
  const mergedNodeTypes = useMemo<NodeTypes>(
    () => ({ ...nodeTypes, stroke: StrokeNode }),
    [nodeTypes],
  );

  return (
    <ReactFlowProvider>
      <Canvas
        nodes={nodes}
        edges={edges}
        nodeTypes={mergedNodeTypes}
        edgeTypes={edgeTypes}
        annotations={annotations}
        mapId={mapId}
        frameId={frameId}
        userId={userId}
        isEditMode={isEditMode}
        onNodeNavigate={onNodeNavigate}
        onAddClaim={onAddClaim}
        stakes={stakes}
      />
    </ReactFlowProvider>
  );
}

function Canvas({
  nodes,
  edges,
  nodeTypes,
  edgeTypes,
  annotations,
  mapId,
  frameId,
  userId,
  isEditMode,
  onNodeNavigate,
  onAddClaim,
  stakes,
}: {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  edgeTypes?: EdgeTypes;
  annotations: Annotation[];
  mapId: string;
  frameId?: string;
  userId: string;
  isEditMode: boolean;
  onNodeNavigate?: (nodeId: string) => string | null;
  onAddClaim?: () => void;
  stakes?: StakeMap;
}) {
  const router = useRouter();
  const reactFlow = useReactFlow();
  const mode = useUIStore((s) => s.mode);
  const optimisticAdds = useUIStore((s) => s.optimisticAdds);
  const optimisticDeletes = useUIStore((s) => s.optimisticDeletes);
  const bindMap = useUIStore((s) => s.bindMap);
  const addOptimistic = useUIStore((s) => s.addOptimistic);
  const removeOptimistic = useUIStore((s) => s.removeOptimistic);
  const openSidePanel = useUIStore((s) => s.openSidePanel);
  const [contextMenu, setContextMenu] = useState<NodeContextMenuState | null>(
    null,
  );

  // Reset session-local annotation state when the map changes.
  useEffect(() => {
    bindMap(mapId);
  }, [mapId, bindMap]);

  // Phase 5 / DIA-ANNO-4 — subscribe to Supabase Realtime so other users'
  // strokes appear in this client within ~200ms. Inserts/updates land in the
  // optimistic-adds layer; deletes land in optimistic-deletes. Self-broadcasts
  // are dedup'd by id since our own optimistic entries already have that id.
  useEffect(() => {
    const unsubscribe = subscribeToAnnotations(mapId, {
      onUpsert: (annotation) => {
        if (annotation.userId === userId) return; // already in local store
        addOptimistic(annotation);
      },
      onDelete: (id) => {
        removeOptimistic(id);
      },
    });
    return unsubscribe;
  }, [mapId, userId, addOptimistic, removeOptimistic]);

  const drawing = useDrawingHandlers({
    mapId,
    frameId,
    userId,
    isEditMode,
  });

  // Delete / Backspace removes selected stroke (or text-box) nodes.
  // We handle this ourselves rather than rely on React Flow's built-in
  // `deleteKeyCode` so we go through the existing eraseAnnotation flow —
  // optimistic delete, undo-history push, DB persist — in one path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      // Don't intercept while the user is typing inside a textbox / input.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA")
      ) {
        return;
      }
      const selected = reactFlow
        .getNodes()
        .filter((n) => n.selected && n.type === "stroke");
      if (selected.length === 0) return;
      e.preventDefault();
      for (const node of selected) {
        const ann = (node.data as { annotation?: Annotation }).annotation;
        if (ann) void drawing.eraseAnnotation(ann);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reactFlow, drawing]);

  // Merge server annotations with optimistic adds, filter by optimistic deletes.
  // Filter further by frameId scope: frame view sees only this frame's annotations.
  const visibleAnnotations = useMemo<Annotation[]>(() => {
    const byId: Record<string, Annotation> = {};
    for (const a of annotations) byId[a.id] = a;
    for (const a of Object.values(optimisticAdds)) byId[a.id] = a;
    return Object.values(byId).filter((a) => {
      if (optimisticDeletes[a.id]) return false;
      if (frameId) return a.frameId === frameId;
      // Crux view: show annotations with no frame attachment.
      return a.frameId === undefined;
    });
  }, [annotations, optimisticAdds, optimisticDeletes, frameId]);

  // Quick lookup of any visible annotation by id (used by move/erase dispatch).
  const annotationById = useMemo<Record<string, Annotation>>(() => {
    const acc: Record<string, Annotation> = {};
    for (const a of visibleAnnotations) acc[a.id] = a;
    return acc;
  }, [visibleAnnotations]);

  // Promote each annotation to a React Flow node alongside content nodes.
  // Strokes are draggable in select mode so the user can move them with a mouse/finger;
  // panning is taken over by 2-finger trackpad scroll (`panOnScroll`) below.
  const allNodes = useMemo<Node[]>(() => {
    const strokeNodes = visibleAnnotations.map<Node>((a) => ({
      id: a.id,
      type: "stroke",
      position: a.origin,
      data: { annotation: a, eraseHover: mode === "erase" },
      width: a.width,
      height: a.height,
      draggable: mode === "select",
      selectable: mode === "select" || mode === "erase",
      // Annotations live above content nodes visually.
      zIndex: 5,
    }));
    return [...nodes, ...strokeNodes];
  }, [nodes, visibleAnnotations, mode]);

  // Track stroke drags. During drag we optimistically update origin so the node
  // visually follows the cursor (React Flow respects the controlled `position`).
  // On release we also persist via createAnnotation (idempotent — replace by id).
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type !== "position") continue;
        const positionChange = change as NodePositionChange;
        if (!positionChange.position) continue;
        const annotation = annotationById[positionChange.id];
        if (!annotation) continue; // content nodes (cruxTile etc.) — ignore
        const moved: Annotation = {
          ...annotation,
          origin: positionChange.position,
        };
        addOptimistic(moved);
        if (positionChange.dragging === false) {
          void createAnnotation(mapId, moved).catch((err) =>
            console.error("[canvas] persist annotation move failed", err),
          );
        }
      }
    },
    [annotationById, addOptimistic, mapId],
  );

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      // Eraser: clicking any stroke node deletes that annotation.
      if (mode === "erase" && node.type === "stroke") {
        const ann = (node.data as { annotation?: Annotation }).annotation;
        if (ann) {
          void drawing.eraseAnnotation(ann);
        }
        return;
      }
      if (mode !== "select" || node.type === "stroke") return;
      // Frame view: clicking a claim/question opens the side panel (PRD §5.3 / DIA-VIEW-3.5).
      if (frameId && (node.type === "claim" || node.type === "question")) {
        openSidePanel({ frameId, nodeId: node.id });
        return;
      }
      // Crux view: navigate into the clicked crux's frame.
      const target = onNodeNavigate?.(node.id);
      if (target) router.push(target);
    },
    [mode, drawing, frameId, openSidePanel, onNodeNavigate, router],
  );

  // Right-click on a content node opens the stake context menu. PRD §10.1.
  const handleNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      if (!frameId) return;
      if (node.type !== "claim" && node.type !== "question") return;
      event.preventDefault();
      event.stopPropagation();
      const bucket = stakes?.[stakeKey(frameId, node.id)];
      setContextMenu({
        mapId,
        frameId,
        nodeId: node.id,
        selfStaked: bucket?.selfStaked ?? false,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [frameId, mapId, stakes],
  );

  const drawingActive = mode === "draw";

  return (
    <div
      className="relative h-full w-full bg-dia-bg"
      onPointerDown={drawing.onPointerDown}
      onPointerMove={drawing.onPointerMove}
      onPointerUp={drawing.onPointerUp}
      onClick={drawing.onPaneClick}
      style={{ touchAction: drawingActive ? "none" : undefined }}
    >
      <ReactFlow
        nodes={allNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onNodesChange={handleNodesChange}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        // Pan with 2-finger trackpad scroll (or wheel). Single-finger / mouse drag is
        // reserved for selecting and dragging stroke nodes in select mode.
        panOnDrag={false}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        fitView
        fitViewOptions={{ padding: 0.18 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          style: { stroke: "#3a3a3a", strokeWidth: 1.5 },
        }}
      >
        <Background color="#1a1a1a" gap={32} size={1} />
      </ReactFlow>
      <InFlightStrokeLayer />
      <CanvasMinimap />
      <EditToolbar
        mapId={mapId}
        isEditMode={isEditMode}
        onAddClaim={onAddClaim}
      />
      <NodeContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
}

function CanvasMinimap() {
  return (
    <div className="pointer-events-none absolute bottom-7 right-7 z-10">
      <div className="relative h-[130px] w-[200px] overflow-hidden rounded-md border border-dia-border bg-dia-surface-2">
        <span className="pointer-events-none absolute left-2.5 top-2.5 z-10 font-mono text-[10px] tracking-[1.2px] text-dia-fg-dim">
          OVERVIEW
        </span>
        <div
          className="pointer-events-auto absolute left-3 top-7"
          style={{ width: 176, height: 90 }}
        >
          <MiniMap
            pannable={false}
            zoomable={false}
            maskColor="rgba(0,0,0,0.6)"
            bgColor="transparent"
            nodeColor={(node) =>
              typeof node.data?.tint === "string"
                ? (node.data.tint as string)
                : "#cdf4d3"
            }
            nodeStrokeWidth={0}
            style={{
              width: 176,
              height: 90,
              background: "transparent",
            }}
          />
        </div>
      </div>
    </div>
  );
}
