"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import type { ArgMap, Frame, Annotation, HandleId } from "@/lib/schema";
import type { StakeMap } from "@/lib/data/stakes-types";
import { CanvasShell, type MoveHandlers } from "@/components/canvas/CanvasShell";
import { MovableLabelEdge } from "@/components/canvas/MovableLabelEdge";
import { UndoRedoControls } from "@/components/frame/UndoRedoControls";
import { applyMovePatch, applyDeletePatch, runAutoFormat, updateNodeText } from "@/lib/data/mutations";
import { normalizeHandleId } from "@/lib/layout/normalizeHandle";
import { useUIStore } from "@/lib/state/useUIStore";
import { stakeKey } from "@/lib/data/stakes-types";
import { cruxColorByIndex } from "@/lib/palette";
import { ClaimNode, QuestionNode } from "./ClaimNode";

const NODE_TYPES: NodeTypes = {
  claim: ClaimNode,
  question: QuestionNode,
};

const EDGE_TYPES: EdgeTypes = {
  labeled: MovableLabelEdge,
};

type PositionStep = {
  nodeId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

export function FrameCanvas({
  map,
  frame,
  annotations,
  userId,
  displayName,
  userColor,
  isEditMode,
  stakes,
  onReady,
}: {
  map: ArgMap;
  frame: Frame;
  annotations: Annotation[];
  userId: string;
  displayName: string;
  userColor: string;
  isEditMode: boolean;
  stakes: StakeMap;
  onReady?: () => void;
}) {
  const selectedNodeId = useUIStore((s) =>
    s.sidePanelNode?.frameId === frame.id ? s.sidePanelNode.nodeId : null,
  );
  const hoveredNodeId = useUIStore((s) => s.hoveredNodeId);

  const { nodes, edges } = useMemo(() => {
    const cruxIndex = map.cruxes.findIndex((c) => c.id === frame.cruxId);
    const { pale, deep } = cruxColorByIndex(cruxIndex);
    const nodes: Node[] = frame.nodeInstances.map((inst) => {
      const canonical = map.nodes[inst.nodeId];
      const tint = pale;
      const size = inst.size ?? { width: 368, height: 300 };
      return {
        id: inst.nodeId,
        type: canonical?.type ?? "claim",
        position: inst.position,
        data: {
          text: canonical?.text ?? "",
          tint,
          bgColor: pale,
          textColor: deep,
          selected: selectedNodeId === inst.nodeId,
          hovered: hoveredNodeId === inst.nodeId,
          stakes: stakes?.[stakeKey(frame.id, inst.nodeId)],
          userId,
          displayName,
          mapId: map.id,
          frameId: frame.id,
          hasSnippets: !!canonical?.snippets?.length,
          snippetCount: canonical?.snippets?.length ?? 0,
        },
        width: size.width,
        height: size.height,
        draggable: false,
      };
    });

    const edges: Edge[] = frame.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: normalizeHandleId(e.sourceHandle),
      targetHandle: normalizeHandleId(e.targetHandle),
      type: "labeled",
      markerEnd: e.undirected
        ? undefined
        : { type: MarkerType.ArrowClosed, color: "#fff", width: 18, height: 18 },
      style: { stroke: "#fff", strokeWidth: 1.2 },
      data: {
        label: e.label,
        relType: e.relType,
        labelOffset: e.labelOffset ?? 0,
        curvature: e.curvature,
        variant: "frame" as const,
      },
    }));

    return { nodes, edges };
  }, [map, frame, selectedNodeId, hoveredNodeId, stakes, userId, displayName]);

  // ── Undo / redo (session-only, edit mode only) ─────────────────────────────
  const [undoStack, setUndoStack] = useState<PositionStep[]>([]);
  const [redoStack, setRedoStack] = useState<PositionStep[]>([]);

  // Track current tile positions as we apply moves — stays ahead of the async
  // server re-fetch so undo/redo always snapshots the right "before" state.
  const currentPositions = useRef<Map<string, { x: number; y: number }>>(
    new Map(frame.nodeInstances.map((ni) => [ni.nodeId, ni.position])),
  );

  // Imperative handle into CanvasShell's internal overrides — filled on mount.
  const imperativeRef = useRef<{
    moveNode: (nodeId: string, pos: { x: number; y: number }) => void;
    clearOverrides: () => void;
  } | null>(null);

  const onNodeMove = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      const prev =
        currentPositions.current.get(nodeId) ??
        frame.nodeInstances.find((ni) => ni.nodeId === nodeId)?.position;

      if (prev) {
        setUndoStack((s) => [...s, { nodeId, from: prev, to: position }]);
        setRedoStack([]); // new move invalidates the redo branch
      }
      currentPositions.current.set(nodeId, position);

      void applyMovePatch(map.id, {
        framePositions: { [frame.id]: { [nodeId]: position } },
      }).catch((err) => console.error("[frame] persist node move failed", err));
    },
    [map.id, frame.id, frame.nodeInstances],
  );

  const handleUndo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const step = stack[stack.length - 1];
      setRedoStack((r) => [...r, step]);
      // Update visual immediately via the imperative handle.
      imperativeRef.current?.moveNode(step.nodeId, step.from);
      currentPositions.current.set(step.nodeId, step.from);
      void applyMovePatch(map.id, {
        framePositions: { [frame.id]: { [step.nodeId]: step.from } },
      }).catch(console.error);
      return stack.slice(0, -1);
    });
  }, [map.id, frame.id]);

  const handleRedo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const step = stack[stack.length - 1];
      setUndoStack((u) => [...u, step]);
      imperativeRef.current?.moveNode(step.nodeId, step.to);
      currentPositions.current.set(step.nodeId, step.to);
      void applyMovePatch(map.id, {
        framePositions: { [frame.id]: { [step.nodeId]: step.to } },
      }).catch(console.error);
      return stack.slice(0, -1);
    });
  }, [map.id, frame.id]);

  // Keyboard shortcuts — ⌘Z / ⌘⇧Z, edit mode only.
  useEffect(() => {
    if (!isEditMode) return;
    function handler(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        handleRedo();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditMode, handleUndo, handleRedo]);

  const onEdgeReconnect = useCallback(
    (
      edgeId: string,
      side: "source" | "target",
      newNodeId: string,
      newHandleId: string | null,
    ) => {
      const handleKey = side === "source" ? "sourceHandle" : "targetHandle";
      void applyMovePatch(map.id, {
        frameEdges: {
          [frame.id]: {
            [edgeId]: {
              [side]: newNodeId,
              [handleKey]: (newHandleId as HandleId | null) ?? null,
            },
          },
        },
      }).catch((err) =>
        console.error("[frame] persist edge reconnect failed", err),
      );
    },
    [map.id, frame.id],
  );

  const onEdgeLabelOffset = useCallback(
    (edgeId: string, offset: number) => {
      void applyMovePatch(map.id, {
        frameEdges: { [frame.id]: { [edgeId]: { labelOffset: offset } } },
      }).catch((err) =>
        console.error("[frame] persist edge label offset failed", err),
      );
    },
    [map.id, frame.id],
  );

  const router = useRouter();

  const onDelete = useCallback(
    (selection: { nodeIds: string[]; edgeIds: string[] }) => {
      if (selection.nodeIds.length === 0 && selection.edgeIds.length === 0) {
        return;
      }
      void applyDeletePatch(map.id, {
        frameNodeIds:
          selection.nodeIds.length > 0
            ? { [frame.id]: selection.nodeIds }
            : undefined,
        frameEdgeIds:
          selection.edgeIds.length > 0
            ? { [frame.id]: selection.edgeIds }
            : undefined,
      })
        .then(() => router.refresh())
        .catch((err) => console.error("[frame] delete failed", err));
    },
    [map.id, frame.id, router],
  );

  const onRenameNode = useCallback(
    (nodeId: string, text: string) => {
      void updateNodeText(map.id, nodeId, text)
        .then(() => router.refresh())
        .catch((err) => console.error("[frame] rename node failed", err));
    },
    [map.id, router],
  );

  const moveHandlers: MoveHandlers | undefined = isEditMode
    ? { onNodeMove, onEdgeReconnect, onEdgeLabelOffset, onDelete, onRenameNode }
    : undefined;

  const onAutoFormat = useCallback(
    async () => {
      try {
        await runAutoFormat(map.id, frame.id);
        // Clear drag overrides so the fresh ELK positions are shown immediately.
        imperativeRef.current?.clearOverrides();
        setUndoStack([]);
        setRedoStack([]);
        router.refresh();
      } catch (err) {
        console.error("[frame] auto-format failed", err);
      }
    },
    [map.id, frame.id, router],
  );

  return (
    <>
      <CanvasShell
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        annotations={annotations}
        mapId={map.id}
        frameId={frame.id}
        userId={userId}
        displayName={displayName}
        userColor={userColor}
        isEditMode={isEditMode}
        onAutoFormat={isEditMode ? onAutoFormat : undefined}
        onReady={onReady}
        stakes={stakes}
        moveHandlers={moveHandlers}
        imperativeRef={imperativeRef}
      />
      {isEditMode && (
        <UndoRedoControls
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          undoCount={undoStack.length}
          redoCount={redoStack.length}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onReset={onAutoFormat}
        />
      )}
    </>
  );
}
