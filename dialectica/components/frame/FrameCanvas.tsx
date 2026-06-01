"use client";

import { useMemo } from "react";
import {
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import type { ArgMap, Frame, Annotation } from "@/lib/schema";
import type { StakeMap } from "@/lib/data/stakes-types";
import { CanvasShell } from "@/components/canvas/CanvasShell";
import { useUIStore } from "@/lib/state/useUIStore";
import { ClaimNode, QuestionNode } from "./ClaimNode";
import { LabeledEdge } from "./LabeledEdge";

const NODE_TYPES: NodeTypes = {
  claim: ClaimNode,
  question: QuestionNode,
};

const EDGE_TYPES: EdgeTypes = {
  labeled: LabeledEdge,
};

export function FrameCanvas({
  map,
  frame,
  annotations,
  userId,
  isEditMode,
  stakes,
}: {
  map: ArgMap;
  frame: Frame;
  annotations: Annotation[];
  userId: string;
  isEditMode: boolean;
  stakes: StakeMap;
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
      type: "labeled",
      data: { label: e.label },
      label: e.label,
      markerEnd: e.undirected
        ? undefined
        : { type: MarkerType.ArrowClosed, color: "#8a8a8a", width: 18, height: 18 },
      style: { stroke: "#8a8a8a", strokeWidth: 1.2 },
    }));

    return { nodes, edges };
  }, [map, frame, selectedNodeId]);

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
      isEditMode={isEditMode}
      stakes={stakes}
    />
  );
}
