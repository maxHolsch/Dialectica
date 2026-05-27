"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";

/**
 * Smooth-step edge with an HTML label rendered on top via EdgeLabelRenderer.
 * Used by the frame view to support multi-line labels with proper styling
 * (matches Figma node 2:15 connector labels like "Shifts responsibility from
 * AI traits to human decisions" that wrap across 2 lines).
 */
export function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const label = typeof data?.label === "string" ? data.label : undefined;
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 14,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className="nodrag nopan pointer-events-none absolute max-w-[260px] whitespace-normal rounded bg-dia-bg px-2 py-1 text-center font-mono text-[12px] leading-[1.45] text-dia-fg-muted"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
