"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { CURSORS } from "@/lib/canvas/cursors";
import { cruxColorByIndex } from "@/lib/palette";
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
  hideClose = false,
}: {
  map: ArgMap;
  annotations: Annotation[];
  userId: string;
  displayName: string;
  userColor: string;
  isEditMode: boolean;
  hideClose?: boolean;
}) {
  // Hide header during frame-view back-transition to avoid colliding with the
  // morphing header text in FrameView, which occupies the same screen position.
  const [headerVisible, setHeaderVisible] = useState(true);
  // headerH: animate from frame height (128) back down to crux height (102)
  // when the frame-exit completes, giving a smooth bottom-edge morph.
  const [headerH, setHeaderH] = useState(102);
  const morphRafRef = useRef<number>(0);
  useEffect(() => {
    const onExit = () => {
      setHeaderH(128);      // pre-size to match the frame header (still hidden)
      setHeaderVisible(false);
    };
    const onDone = () => {
      setHeaderVisible(true);   // reveal at 128px
      // Two rAFs: first lets React commit the 128px height, second triggers
      // the CSS transition so the browser sees an actual change 128 → 102.
      morphRafRef.current = requestAnimationFrame(() => {
        morphRafRef.current = requestAnimationFrame(() => setHeaderH(102));
      });
    };
    window.addEventListener(FRAME_EXIT_EVENT, onExit);
    window.addEventListener(FRAME_EXIT_DONE_EVENT, onDone);
    return () => {
      window.removeEventListener(FRAME_EXIT_EVENT, onExit);
      window.removeEventListener(FRAME_EXIT_DONE_EVENT, onDone);
      cancelAnimationFrame(morphRafRef.current);
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
      ...map.cruxes.map((c, idx) => {
        const size = c.size ?? { width: 200, height: 200 };
        const { pale, deep } = cruxColorByIndex(idx);
        return {
          id: c.id,
          type: "cruxTile",
          position: c.position,
          data: { text: c.question, tint: pale, index: idx + 1, bgColor: pale, textColor: deep },
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
        : { type: MarkerType.ArrowClosed, color: "#fff", width: 18, height: 18 },
      style: { stroke: "#fff", strokeWidth: 1.2 },
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
    async () => {
      try {
        await runAutoFormat(map.id);
        router.refresh();
      } catch (err) {
        console.error("[crux] auto-format failed", err);
      }
    },
    [map.id, router],
  );

  return (
    <div className="relative h-full w-full">
      {hideClose ? null : (
        <Link
          href="/"
          className="fixed z-[51] flex items-center justify-center rounded-full"
          style={{ top: 32, left: 32, width: 48, height: 48, backgroundColor: "#131313", border: "1px solid #2a2a2a", color: "#ffffff", cursor: CURSORS.pointer }}
        >
          <X size={18} weight="regular" />
        </Link>
      )}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50"
        style={{
          height: headerH,
          backgroundColor: "#131313",
          borderBottom: "1px solid #1C1C1C",
          transition: "height 200ms ease-in-out",
        }}
      />
      <div
        className="pointer-events-none fixed left-0 right-0 z-50 flex justify-center"
        style={{ top: 36 }}
      >
        <p
          className="whitespace-nowrap font-serif text-[20px]"
          style={{
            color: "#FFFFFF",
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
        onAutoFormat={undefined}
        moveHandlers={moveHandlers}
      />
    </div>
  );
}
