"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
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
import { EditToolbar } from "./EditToolbar";
import { StrokeNode } from "./StrokeNode";
import { InFlightStrokeLayer } from "./InFlightStrokeLayer";

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
}) {
  const router = useRouter();
  const mode = useUIStore((s) => s.mode);
  const optimisticAdds = useUIStore((s) => s.optimisticAdds);
  const optimisticDeletes = useUIStore((s) => s.optimisticDeletes);
  const bindMap = useUIStore((s) => s.bindMap);
  const addOptimistic = useUIStore((s) => s.addOptimistic);

  // Reset session-local annotation state when the map changes.
  useEffect(() => {
    bindMap(mapId);
  }, [mapId, bindMap]);

  const drawing = useDrawingHandlers({ mapId, frameId, userId });

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
      // Select mode: clicking a content node may navigate (strokes get dragged, not navigated).
      if (mode === "select" && node.type !== "stroke") {
        const target = onNodeNavigate?.(node.id);
        if (target) router.push(target);
      }
    },
    [mode, drawing, onNodeNavigate, router],
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
