"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
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
  type Connection,
  type OnReconnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Annotation } from "@/lib/schema";
import type { LayoutStrategyId } from "@/lib/layout/strategies";
import { useUIStore } from "@/lib/state/useUIStore";
import { useDrawingHandlers } from "@/lib/canvas/useDrawingHandlers";
import { createAnnotation } from "@/lib/data/mutations";
import { subscribeToAnnotations } from "@/lib/realtime/annotations";
import { useCursorChannel } from "@/lib/realtime/cursors";
import { stakeKey, type StakeMap } from "@/lib/data/stakes-types";
import { EditToolbar } from "./EditToolbar";
import { StrokeNode } from "./StrokeNode";
import { InFlightStrokeLayer } from "./InFlightStrokeLayer";
import { RemoteCursorLayer } from "./RemoteCursorLayer";
import {
  NodeContextMenu,
  type NodeContextMenuState,
} from "@/components/frame/ContextMenu";

/**
 * Move-mode handlers supplied by the parent canvas. Each canvas (crux vs
 * frame) translates these into the correct shape of `applyMovePatch` because
 * the underlying JSON paths differ.
 */
export type MoveHandlers = {
  onNodeMove: (nodeId: string, position: { x: number; y: number }) => void;
  onEdgeReconnect: (
    edgeId: string,
    side: "source" | "target",
    newNodeId: string,
    newHandleId: string | null,
  ) => void;
  onEdgeLabelOffset: (edgeId: string, offset: number) => void;
  /** Delete a current selection of content nodes and/or edges. */
  onDelete: (selection: { nodeIds: string[]; edgeIds: string[] }) => void;
};

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
  displayName,
  userColor,
  isEditMode,
  onNodeNavigate,
  onAddClaim,
  onAutoFormat,
  onReady,
  stakes,
  moveHandlers,
}: {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  edgeTypes?: EdgeTypes;
  annotations: Annotation[];
  mapId: string;
  frameId?: string;
  userId: string;
  displayName: string;
  userColor: string;
  isEditMode: boolean;
  onNodeNavigate?: (nodeId: string) => string | null;
  onAddClaim?: () => void;
  /** Edit-mode only: fire auto-format with the chosen strategy and refresh. */
  onAutoFormat?: (strategy: LayoutStrategyId) => void | Promise<void>;
  /** Called once after ReactFlow initialises and fitView completes. */
  onReady?: () => void;
  /** Frame view only: stake aggregates keyed by `${frameId}::${nodeId}`. */
  stakes?: StakeMap;
  /** Edit-mode only: handlers wiring move-mode interactions to persistence. */
  moveHandlers?: MoveHandlers;
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
        displayName={displayName}
        userColor={userColor}
        isEditMode={isEditMode}
        onNodeNavigate={onNodeNavigate}
        onAddClaim={onAddClaim}
        onAutoFormat={onAutoFormat}
        onReady={onReady}
        stakes={stakes}
        moveHandlers={moveHandlers}
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
  displayName,
  userColor,
  isEditMode,
  onNodeNavigate,
  onAddClaim,
  onAutoFormat,
  onReady,
  stakes,
  moveHandlers,
}: {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  edgeTypes?: EdgeTypes;
  annotations: Annotation[];
  mapId: string;
  frameId?: string;
  userId: string;
  displayName: string;
  userColor: string;
  isEditMode: boolean;
  onNodeNavigate?: (nodeId: string) => string | null;
  onAddClaim?: () => void;
  onAutoFormat?: (strategy: LayoutStrategyId) => void | Promise<void>;
  onReady?: () => void;
  stakes?: StakeMap;
  moveHandlers?: MoveHandlers;
}) {
  const router = useRouter();
  const reactFlow = useReactFlow();
  const [canvasReady, setCanvasReady] = useState(false);
  const handleInit = useCallback(() => {
    setCanvasReady(true);
    onReady?.();
    // The frame view has a fixed two-line header covering ~100px at the top.
    // After fitView centers the content in the full viewport, shift the fitted
    // position down by half the header height so nodes are centered in the
    // visible area below the header rather than partially hidden behind it.
    if (frameId) {
      requestAnimationFrame(() => {
        const vp = reactFlow.getViewport();
        reactFlow.setViewport({ ...vp, y: vp.y + 50 });
      });
    }
  }, [onReady, frameId, reactFlow]);
  const mode = useUIStore((s) => s.mode);
  const optimisticAdds = useUIStore((s) => s.optimisticAdds);
  const optimisticDeletes = useUIStore((s) => s.optimisticDeletes);
  const bindMap = useUIStore((s) => s.bindMap);
  const addOptimistic = useUIStore((s) => s.addOptimistic);
  const removeOptimistic = useUIStore((s) => s.removeOptimistic);
  const openSidePanel = useUIStore((s) => s.openSidePanel);
  const closeSidePanel = useUIStore((s) => s.closeSidePanel);
  const sidePanelNode = useUIStore((s) => s.sidePanelNode);
  const [contextMenu, setContextMenu] = useState<NodeContextMenuState | null>(
    null,
  );
  // Optimistically hide deleted content nodes/edges so the canvas updates
  // instantly. The parent canvas re-renders with the post-delete map and the
  // hidden ids become naturally absent from `nodes`/`edges`.
  const [deletedNodeIds, setDeletedNodeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deletedEdgeIds, setDeletedEdgeIds] = useState<Set<string>>(
    () => new Set(),
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
        if (annotation.userId === userId) {
          console.log("[realtime] skipping self upsert", {
            incoming: annotation.userId,
            self: userId,
          });
          return;
        }
        console.log("[realtime] applying remote upsert", annotation.id);
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

  // Live cursor pub/sub. Coordinates travel in flow-space so they survive
  // each peer's pan/zoom — the layer converts back to screen-space using
  // the local viewport.
  const cursorChannel = useCursorChannel(mapId, {
    userId,
    displayName,
    color: userColor,
  });

  // Delete / Backspace removes selected stroke (or text-box) nodes, as well
  // as content nodes / edges in move mode (edit-role users only). We handle
  // this ourselves rather than rely on React Flow's built-in `deleteKeyCode`
  // so strokes go through eraseAnnotation (optimistic + history) and content
  // entities go through the parent canvas's onDelete handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA")
      ) {
        return;
      }
      const allNodes = reactFlow.getNodes();
      const strokeSelected = allNodes.filter(
        (n) => n.selected && n.type === "stroke",
      );
      const contentNodeSelected = allNodes.filter(
        (n) => n.selected && n.type !== "stroke",
      );
      const edgeSelected = reactFlow.getEdges().filter((eg) => eg.selected);

      if (
        strokeSelected.length === 0 &&
        contentNodeSelected.length === 0 &&
        edgeSelected.length === 0
      ) {
        return;
      }
      e.preventDefault();

      for (const node of strokeSelected) {
        const ann = (node.data as { annotation?: Annotation }).annotation;
        if (ann) void drawing.eraseAnnotation(ann);
      }
      if (
        moveHandlers &&
        (contentNodeSelected.length > 0 || edgeSelected.length > 0)
      ) {
        const nodeIds = contentNodeSelected.map((n) => n.id);
        const edgeIds = edgeSelected.map((eg) => eg.id);
        // Optimistically hide before the server roundtrip resolves.
        if (nodeIds.length > 0) {
          setDeletedNodeIds((prev) => {
            const next = new Set(prev);
            for (const id of nodeIds) next.add(id);
            return next;
          });
        }
        if (edgeIds.length > 0) {
          setDeletedEdgeIds((prev) => {
            const next = new Set(prev);
            for (const id of edgeIds) next.add(id);
            return next;
          });
        }
        moveHandlers.onDelete({ nodeIds, edgeIds });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reactFlow, drawing, moveHandlers]);

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

  // Move-mode local override layer: drag deltas applied on top of the
  // map-derived `nodes`/`edges` props so the canvas updates instantly while
  // the server persist round-trips. Cleared when the parent re-renders with
  // fresh map data (the override matches what's already in the prop).
  const [nodeOverrides, setNodeOverrides] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [edgeOverrides, setEdgeOverrides] = useState<
    Record<
      string,
      {
        source?: string;
        target?: string;
        labelOffset?: number;
        sourceHandle?: string | null;
        targetHandle?: string | null;
      }
    >
  >({});

  // Promote each annotation to a React Flow node alongside content nodes.
  // Strokes are draggable in select mode so the user can move them with a mouse/finger;
  // panning is taken over by 2-finger trackpad scroll (`panOnScroll`) below.
  const allNodes = useMemo<Node[]>(() => {
    const contentNodes = nodes
      .filter((n) => !deletedNodeIds.has(n.id))
      .map<Node>((n) => {
        const override = nodeOverrides[n.id];
        const position = override ?? n.position;
        return {
          ...n,
          position,
          // Edit-mode users get drag affordance on content nodes when the
          // yellow move tool is selected.
          draggable: mode === "move" && !!moveHandlers,
        };
      });
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
    return [...contentNodes, ...strokeNodes];
  }, [
    nodes,
    nodeOverrides,
    visibleAnnotations,
    mode,
    moveHandlers,
    deletedNodeIds,
  ]);

  // Apply edge overrides + inject the per-edge label-offset callback so the
  // MovableLabelEdge can persist via the parent canvas without prop-drilling.
  const onEdgeLabelOffsetLocal = useCallback(
    (edgeId: string, offset: number) => {
      setEdgeOverrides((prev) => ({
        ...prev,
        [edgeId]: { ...prev[edgeId], labelOffset: offset },
      }));
      moveHandlers?.onEdgeLabelOffset(edgeId, offset);
    },
    [moveHandlers],
  );

  const allEdges = useMemo<Edge[]>(() => {
    return edges
      .filter(
        (e) =>
          !deletedEdgeIds.has(e.id) &&
          !deletedNodeIds.has(e.source) &&
          !deletedNodeIds.has(e.target),
      )
      .map((e) => {
      const override = edgeOverrides[e.id];
      const source = override?.source ?? e.source;
      const target = override?.target ?? e.target;
      const sourceHandle =
        override?.sourceHandle !== undefined
          ? override.sourceHandle ?? undefined
          : e.sourceHandle;
      const targetHandle =
        override?.targetHandle !== undefined
          ? override.targetHandle ?? undefined
          : e.targetHandle;
      const labelOffset =
        override?.labelOffset ??
        (typeof e.data?.labelOffset === "number"
          ? (e.data.labelOffset as number)
          : 0);
      return {
        ...e,
        source,
        target,
        sourceHandle,
        targetHandle,
        reconnectable:
          mode === "move" && !!moveHandlers ? true : false,
        data: {
          ...(e.data ?? {}),
          labelOffset,
          onLabelOffsetChange: moveHandlers ? onEdgeLabelOffsetLocal : undefined,
        },
      };
    });
  }, [
    edges,
    edgeOverrides,
    mode,
    moveHandlers,
    onEdgeLabelOffsetLocal,
    deletedNodeIds,
    deletedEdgeIds,
  ]);

  // Track stroke drags. During drag we optimistically update origin so the node
  // visually follows the cursor (React Flow respects the controlled `position`).
  // On release we also persist via createAnnotation (idempotent — replace by id).
  // In move mode the same change events drive content-node drag persistence
  // (cruxes, top question, frame nodes) through the parent's moveHandlers.
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type !== "position") continue;
        const positionChange = change as NodePositionChange;
        if (!positionChange.position) continue;
        const annotation = annotationById[positionChange.id];
        if (annotation) {
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
          continue;
        }
        // Content node drag (move mode only). Track overrides for instant
        // visual feedback; flush to server when the drag releases.
        if (mode === "move" && moveHandlers) {
          const next = positionChange.position;
          setNodeOverrides((prev) => ({ ...prev, [positionChange.id]: next }));
          if (positionChange.dragging === false) {
            moveHandlers.onNodeMove(positionChange.id, next);
          }
        }
      }
    },
    [annotationById, addOptimistic, mapId, mode, moveHandlers],
  );

  // Edge reconnect (move mode). React Flow fires this when a user drags an
  // edge endpoint onto a different node/handle. We detect which side moved by
  // comparing old vs new connection, optimistically apply via overrides, and
  // let the parent persist. Handle ids (e.g. "src-top") flow through too so
  // xyflow routes the new edge to the same side the user dropped on.
  const handleReconnect: OnReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!moveHandlers) return;
      const sourceChanged =
        oldEdge.source !== newConnection.source ||
        (oldEdge.sourceHandle ?? null) !== (newConnection.sourceHandle ?? null);
      const targetChanged =
        oldEdge.target !== newConnection.target ||
        (oldEdge.targetHandle ?? null) !== (newConnection.targetHandle ?? null);
      if (sourceChanged && newConnection.source) {
        const handle = newConnection.sourceHandle ?? null;
        setEdgeOverrides((prev) => ({
          ...prev,
          [oldEdge.id]: {
            ...prev[oldEdge.id],
            source: newConnection.source!,
            sourceHandle: handle,
          },
        }));
        moveHandlers.onEdgeReconnect(
          oldEdge.id,
          "source",
          newConnection.source,
          handle,
        );
      }
      if (targetChanged && newConnection.target) {
        const handle = newConnection.targetHandle ?? null;
        setEdgeOverrides((prev) => ({
          ...prev,
          [oldEdge.id]: {
            ...prev[oldEdge.id],
            target: newConnection.target!,
            targetHandle: handle,
          },
        }));
        moveHandlers.onEdgeReconnect(
          oldEdge.id,
          "target",
          newConnection.target,
          handle,
        );
      }
    },
    [moveHandlers],
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
      // Frame view: clicking a claim/question toggles the side panel.
      if (frameId && (node.type === "claim" || node.type === "question")) {
        if (sidePanelNode?.nodeId === node.id) {
          closeSidePanel();
        } else {
          openSidePanel({ frameId, nodeId: node.id });
        }
        return;
      }
      // Crux view: navigate into the clicked crux's frame.
      const target = onNodeNavigate?.(node.id);
      if (target) router.push(target);
    },
    [mode, drawing, frameId, sidePanelNode, closeSidePanel, openSidePanel, onNodeNavigate, router],
  );

  const handlePaneClick = useCallback(() => {
    if (sidePanelNode) closeSidePanel();
  }, [sidePanelNode, closeSidePanel]);

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

  // Drag-to-erase: while the user holds the eraser button down, every stroke
  // node the pointer crosses gets deleted. We hit-test with elementsFromPoint
  // (rather than wiring per-node listeners) so a fast drag through several
  // strokes is reliable even when individual hover events get coalesced.
  const eraseSessionRef = useRef<{ active: boolean; erased: Set<string> }>({
    active: false,
    erased: new Set(),
  });

  const eraseAtPoint = useCallback(
    (x: number, y: number) => {
      const session = eraseSessionRef.current;
      if (!session.active) return;
      const hits = document.elementsFromPoint(x, y);
      for (const el of hits) {
        const nodeEl = (el as Element).closest?.(".react-flow__node");
        if (!nodeEl) continue;
        const id = nodeEl.getAttribute("data-id");
        if (!id || session.erased.has(id)) continue;
        const ann = annotationById[id];
        if (!ann) continue;
        session.erased.add(id);
        void drawing.eraseAnnotation(ann);
      }
    },
    [annotationById, drawing],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (mode === "erase" && e.button === 0) {
        // Don't hijack clicks on UI overlays (toolbar, minimap, context menu);
        // only the actual React Flow canvas area should start an erase session.
        const target = e.target as Element | null;
        if (!target?.closest(".react-flow")) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        eraseSessionRef.current = { active: true, erased: new Set() };
        eraseAtPoint(e.clientX, e.clientY);
        return;
      }
      drawing.onPointerDown(e);
    },
    [mode, drawing, eraseAtPoint],
  );

  const broadcastCursor = cursorChannel.broadcast;
  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      // Broadcast every move regardless of mode — the hook throttles.
      const flow = reactFlow.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      broadcastCursor(flow.x, flow.y);

      if (eraseSessionRef.current.active) {
        eraseAtPoint(e.clientX, e.clientY);
        return;
      }
      drawing.onPointerMove(e);
    },
    [drawing, eraseAtPoint, reactFlow, broadcastCursor],
  );

  const handlePointerLeave = useCallback(() => {
    cursorChannel.signalLeave();
  }, [cursorChannel]);

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (eraseSessionRef.current.active) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        eraseSessionRef.current = { active: false, erased: new Set() };
        return;
      }
      drawing.onPointerUp(e);
    },
    [drawing],
  );

  const drawingActive = mode === "draw";
  const moveActive = mode === "move" && !!moveHandlers;

  return (
    <div
      className={`relative h-full w-full bg-dia-bg ${canvasReady ? "canvas-loaded" : "canvas-loading"}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onClick={drawing.onPaneClick}
      // Yellow grab cursor when move tool is active so the user can see
      // they're in drag mode anywhere on the canvas.
      data-move-mode={moveActive ? "1" : undefined}
      style={{
        touchAction: drawingActive || mode === "erase" ? "none" : undefined,
        cursor: moveActive ? "grab" : undefined,
      }}
    >
      <ReactFlow
        nodes={allNodes}
        edges={allEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={handlePaneClick}
        onNodesChange={handleNodesChange}
        onReconnect={moveActive ? handleReconnect : undefined}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        // Pan with 2-finger trackpad scroll (or wheel). Single-finger / mouse drag is
        // reserved for selecting and dragging stroke nodes in select mode.
        panOnDrag={false}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        onInit={handleInit}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          style: { stroke: "#3a3a3a", strokeWidth: 1.5 },
        }}
      >
        <Background color="#1a1a1a" gap={32} size={1} />
      </ReactFlow>
      {moveActive ? (
        // While the yellow move tool is selected: grab cursor on nodes, and
        // reveal the reconnect anchors only on edges the user has explicitly
        // clicked (xyflow paints them transparent by default).
        <style
          dangerouslySetInnerHTML={{
            __html: `[data-move-mode="1"] .react-flow__node{cursor:grab!important}[data-move-mode="1"] .react-flow__node.dragging,[data-move-mode="1"] .react-flow__node:active{cursor:grabbing!important}[data-move-mode="1"] .react-flow__edge.selected .react-flow__edgeupdater{fill:#ffc943!important;fill-opacity:0.85!important;stroke:#7a5a00!important;stroke-width:1!important;cursor:grab!important}`,
          }}
        />
      ) : null}
      <InFlightStrokeLayer />
      <RemoteCursorLayer cursors={cursorChannel.cursors} />
      <EditToolbar
        mapId={mapId}
        isEditMode={isEditMode}
        onAddClaim={onAddClaim}
        onAutoFormat={onAutoFormat}
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
