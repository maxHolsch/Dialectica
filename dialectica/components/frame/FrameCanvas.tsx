"use client";

import { useCallback, useMemo } from "react";
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
import { applyMovePatch, applyDeletePatch, runAutoFormat, updateNodeText } from "@/lib/data/mutations";
import type { LayoutStrategyId } from "@/lib/layout/strategies";
import { normalizeHandleId } from "@/lib/layout/normalizeHandle";
import { useUIStore } from "@/lib/state/useUIStore";
import { ClaimNode, QuestionNode } from "./ClaimNode";

const NODE_TYPES: NodeTypes = {
  claim: ClaimNode,
  question: QuestionNode,
};

const EDGE_TYPES: EdgeTypes = {
  labeled: MovableLabelEdge,
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

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = frame.nodeInstances.map((inst) => {
      const canonical = map.nodes[inst.nodeId];
      const tint = canonical?.type === "question" ? "#ffc2ec" : "#cdf4d3";
      const size = inst.size ?? { width: 368, height: 300 };
      return {
        id: inst.nodeId,
        type: canonical?.type ?? "claim",
        position: inst.position,
        data: {
          text: canonical?.text ?? "",
          tint,
          selected: selectedNodeId === inst.nodeId,
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
        : { type: MarkerType.ArrowClosed, color: "#8a8a8a", width: 18, height: 18 },
      style: { stroke: "#8a8a8a", strokeWidth: 1.2 },
      data: {
        label: e.label,
        relType: e.relType,
        labelOffset: e.labelOffset ?? 0,
        curvature: e.curvature,
        variant: "frame" as const,
      },
    }));

    return { nodes, edges };
  }, [map, frame, selectedNodeId]);

  const onNodeMove = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      void applyMovePatch(map.id, {
        framePositions: { [frame.id]: { [nodeId]: position } },
      }).catch((err) => console.error("[frame] persist node move failed", err));
    },
    [map.id, frame.id],
  );

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
    async (strategy: LayoutStrategyId) => {
      try {
        await runAutoFormat(map.id, strategy);
        router.refresh();
      } catch (err) {
        console.error("[frame] auto-format failed", err);
      }
    },
    [map.id, router],
  );

  return (
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
    />
  );
}
