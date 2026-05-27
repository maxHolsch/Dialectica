"use client";

import { useMemo } from "react";
import {
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import type { ArgMap } from "@/lib/schema";
import { CanvasShell } from "@/components/canvas/CanvasShell";
import { TopQuestionNode } from "./TopQuestionNode";
import { CruxTileNode } from "./CruxTileNode";

const NODE_TYPES: NodeTypes = {
  topQuestion: TopQuestionNode,
  cruxTile: CruxTileNode,
};

export function CruxCanvas({
  map,
  userId,
  isEditMode,
}: {
  map: ArgMap;
  userId: string;
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
      type: "smoothstep",
      pathOptions: { borderRadius: 14 },
      markerEnd: e.undirected
        ? undefined
        : { type: MarkerType.ArrowClosed, color: "#8a8a8a", width: 18, height: 18 },
      style: { stroke: "#8a8a8a", strokeWidth: 1.2 },
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

  return (
    <CanvasShell
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      annotations={map.annotations}
      mapId={map.id}
      userId={userId}
      isEditMode={isEditMode}
      onNodeNavigate={onNodeNavigate}
    />
  );
}
