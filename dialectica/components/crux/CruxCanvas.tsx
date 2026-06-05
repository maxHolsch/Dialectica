"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "@phosphor-icons/react";
import { FRAME_EXIT_EVENT, FRAME_EXIT_DONE_EVENT } from "@/lib/navTransition";
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
import { applyMovePatch, applyDeletePatch, runAutoFormat, updateCruxText } from "@/lib/data/mutations";
import type { LayoutStrategyId } from "@/lib/layout/strategies";
import { normalizeHandleId } from "@/lib/layout/normalizeHandle";
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
  // Hide header during frame-view back-transition to avoid colliding with the
  // morphing header text in FrameView, which occupies the same screen position.
  const [headerVisible, setHeaderVisible] = useState(true);
  useEffect(() => {
    const onExit = () => setHeaderVisible(false);
    const onDone = () => setHeaderVisible(true);
    window.addEventListener(FRAME_EXIT_EVENT, onExit);
    window.addEventListener(FRAME_EXIT_DONE_EVENT, onDone);
    return () => {
      window.removeEventListener(FRAME_EXIT_EVENT, onExit);
      window.removeEventListener(FRAME_EXIT_DONE_EVENT, onDone);
    };
  }, []);

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
        const size = c.size ?? { width: 200, height: 200 };
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
      sourceHandle: normalizeHandleId(e.sourceHandle),
      targetHandle: normalizeHandleId(e.targetHandle),
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

  const router = useRouter();

  const onDelete = useCallback(
    (selection: { nodeIds: string[]; edgeIds: string[] }) => {
      // The crux view treats "top" as the top question; deleting the root is
      // intentionally not supported, so drop it before persisting.
      const cruxIds = selection.nodeIds.filter((id) => id !== "top");
      const cruxEdgeIds = selection.edgeIds;
      if (cruxIds.length === 0 && cruxEdgeIds.length === 0) return;
      void applyDeletePatch(map.id, { cruxIds, cruxEdgeIds })
        .then(() => router.refresh())
        .catch((err) => console.error("[crux] delete failed", err));
    },
    [map.id, router],
  );

  const onRenameNode = useCallback(
    (cruxId: string, text: string) => {
      void updateCruxText(map.id, cruxId, text)
        .then(() => router.refresh())
        .catch((err) => console.error("[crux] rename crux failed", err));
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
        console.error("[crux] auto-format failed", err);
      }
    },
    [map.id, router],
  );

  return (
    <div className="relative h-full w-full">
      <Link
        href="/"
        className="fixed z-[51] flex items-center justify-center rounded-full bg-white"
        style={{ top: 32, left: 32, width: 48, height: 48, border: "1px solid #EEEEEE", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}
      >
        <X size={18} weight="regular" />
      </Link>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50"
        style={{ height: 140, background: "linear-gradient(to bottom, white 0%, white 55%, transparent 100%)" }}
      />
      <div
        className="pointer-events-none fixed left-0 right-0 z-50 flex justify-center"
        style={{ top: 36 }}
      >
        <p
          className="whitespace-nowrap font-serif text-[20px] text-dia-fg"
          style={{
            opacity: headerVisible ? 1 : 0,
            transition: 'opacity 20ms ease-out',
          }}
        >
          {map.topQuestion}
        </p>
      </div>
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
    </div>
  );
}
