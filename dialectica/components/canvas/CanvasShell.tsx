"use client";

import { useCallback } from "react";
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Pencil } from "lucide-react";

/**
 * Shared React Flow canvas used by Crux view (DIA-VIEW-1) and Frame view (DIA-VIEW-2).
 * View-mode: pan + zoom enabled, drag + connect disabled per PRD §6.7.
 */
export function CanvasShell({
  nodes,
  edges,
  nodeTypes,
  edgeTypes,
  /** Optional navigation target on node click. Receives the node's id. */
  onNodeNavigate,
}: {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  edgeTypes?: EdgeTypes;
  onNodeNavigate?: (nodeId: string) => string | null;
}) {
  return (
    <ReactFlowProvider>
      <Canvas
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeNavigate={onNodeNavigate}
      />
    </ReactFlowProvider>
  );
}

function Canvas({
  nodes,
  edges,
  nodeTypes,
  edgeTypes,
  onNodeNavigate,
}: {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  edgeTypes?: EdgeTypes;
  onNodeNavigate?: (nodeId: string) => string | null;
}) {
  const router = useRouter();

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const target = onNodeNavigate?.(node.id);
      if (target) router.push(target);
    },
    [router, onNodeNavigate],
  );

  return (
    <div className="relative h-full w-full bg-dia-bg">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={handleNodeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
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
      <CanvasMinimap />
      <EditPencilButton />
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

function EditPencilButton() {
  return (
    <button
      type="button"
      aria-label="Toggle edit mode (deferred to Phase 3)"
      disabled
      className="absolute bottom-7 left-1/2 z-10 flex size-11 -translate-x-1/2 items-center justify-center rounded-full border border-dia-border-strong bg-dia-bg text-dia-fg-dim transition-colors hover:text-dia-fg-muted disabled:cursor-not-allowed"
    >
      <Pencil className="size-4" strokeWidth={1.5} />
    </button>
  );
}
