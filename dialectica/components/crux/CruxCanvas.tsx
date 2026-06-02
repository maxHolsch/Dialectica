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
import type { ArgMap, Annotation, HandleId } from "@/lib/schema";
import { CanvasShell, type MoveHandlers } from "@/components/canvas/CanvasShell";
import { MovableLabelEdge } from "@/components/canvas/MovableLabelEdge";
import { applyMovePatch, runAutoFormat } from "@/lib/data/mutations";
import type { LayoutStrategyId } from "@/lib/layout/strategies";
import { TopQuestionNode } from "./TopQuestionNode";
import { CruxTileNode } from "./CruxTileNode";

const NODE_TYPES: NodeTypes = {
  topQuestion: TopQuestionNode,
  cruxTile: CruxTileNode,
};

const EDGE_TYPES: EdgeTypes = {
  movable: MovableLabelEdge,
};

export function CruxCanvas({
  map,
  annotations,
  userId,
  displayName,
  userColor,
  isEditMode,
}: {
  map: ArgMap;
  annotations: Annotation[];
  userId: string;
  displayName: string;
  userColor: string;
  isEditMode: boolean;
}) {
  const { nodes, edges } = useMemo(() => {
    const TOP_ID = "top";
    const topSize = map.topQuestionSize ?? { width: 290, height: 265 };

    const nodes: Node[] = [
      {
        id: TOP_ID,
        type: "topQuestion",
        position: map.topQuestionPosition,
        data: { text: map.topQuestion, tint: "#cdf4d3" },
        width: topSize.width,
        height: topSize.height,
        draggable: false,
      },
      ...map.cruxes.map((c) => {
        const size = c.size ?? { width: 336, height: 265 };
        return {
          id: c.id,
          type: "cruxTile",
          position: c.position,
          data: { text: c.question, tint: "#ffc2ec" },
          width: size.width,
          height: size.height,
          draggable: false,
        };
      }),
    ];

    const edges: Edge[] = map.cruxEdges.map((e) => ({
      id: e.id,
      source: e.source === "top" ? TOP_ID : e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: "movable",
      markerEnd: e.undirected
        ? undefined
        : { type: MarkerType.ArrowClosed, color: "#8a8a8a", width: 18, height: 18 },
      style: { stroke: "#8a8a8a", strokeWidth: 1.2 },
      data: {
        label: e.label,
        labelOffset: e.labelOffset ?? 0,
        variant: "crux" as const,
      },
    }));

    return { nodes, edges };
  }, [map]);

  const onNodeNavigate = (nodeId: string): string | null => {
    if (nodeId === "top") {
      return map.topQuestionFrameId
        ? `/m/${map.id}/frame/${map.topQuestionFrameId}`
        : null;
    }
    const crux = map.cruxes.find((c) => c.id === nodeId);
    if (!crux) return null;
    return `/m/${map.id}/frame/${crux.frameId}`;
  };

  // Move-mode persistence. The crux view treats the "top" id as a synthetic
  // alias for the top question — translate back to the schema field when
  // persisting. All operations go through `applyMovePatch`.
  const onNodeMove = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      const mapId = map.id;
      if (nodeId === "top") {
        void applyMovePatch(mapId, { topQuestionPosition: position }).catch(
          (err) => console.error("[crux] persist topQuestion move failed", err),
        );
      } else {
        void applyMovePatch(mapId, {
          cruxPositions: { [nodeId]: position },
        }).catch((err) => console.error("[crux] persist crux move failed", err));
      }
    },
    [map.id],
  );

  const onEdgeReconnect = useCallback(
    (
      edgeId: string,
      side: "source" | "target",
      newNodeId: string,
      newHandleId: string | null,
    ) => {
      // Translate the synthetic top-id back to the schema's stored value.
      const stored = newNodeId === "top" ? "top" : newNodeId;
      const handleKey = side === "source" ? "sourceHandle" : "targetHandle";
      void applyMovePatch(map.id, {
        cruxEdges: {
          [edgeId]: {
            [side]: stored,
            [handleKey]: (newHandleId as HandleId | null) ?? null,
          },
        },
      }).catch((err) => console.error("[crux] persist edge reconnect failed", err));
    },
    [map.id],
  );

  const onEdgeLabelOffset = useCallback(
    (edgeId: string, offset: number) => {
      void applyMovePatch(map.id, {
        cruxEdges: { [edgeId]: { labelOffset: offset } },
      }).catch((err) =>
        console.error("[crux] persist edge label offset failed", err),
      );
    },
    [map.id],
  );

  const moveHandlers: MoveHandlers | undefined = isEditMode
    ? { onNodeMove, onEdgeReconnect, onEdgeLabelOffset }
    : undefined;

  const router = useRouter();
  const onAutoFormat = useCallback(
    async (strategy: LayoutStrategyId) => {
      try {
        await runAutoFormat(map.id, strategy);
        router.refresh();
      } catch (err) {
        console.error("[crux] auto-format failed", err);
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
      userId={userId}
      displayName={displayName}
      userColor={userColor}
      isEditMode={isEditMode}
      onNodeNavigate={onNodeNavigate}
      onAutoFormat={isEditMode ? onAutoFormat : undefined}
      moveHandlers={moveHandlers}
    />
  );
}
