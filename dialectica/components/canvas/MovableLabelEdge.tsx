"use client";

import { useCallback, useRef } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { useUIStore } from "@/lib/state/useUIStore";

type MovableLabelEdgeData = {
  label?: string;
  labelOffset?: number;
  /** Persist the new offset when the user releases a label drag. */
  onLabelOffsetChange?: (edgeId: string, offset: number) => void;
  /** Map a CSS style flag — pink for crux view, dimmed mono for frame view. */
  variant?: "crux" | "frame";
};

// Clamp the label-offset fraction so a label can't slide off the visible
// span of the edge — keeps it near the path even on short edges.
const OFFSET_MIN = -0.45;
const OFFSET_MAX = 0.45;

/**
 * Smooth-step edge with an HTML label rendered on top. In move mode the label
 * becomes draggable along the source→target axis; the parent canvas persists
 * the resulting offset to the map JSON.
 */
export function MovableLabelEdge({
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
  const { screenToFlowPosition } = useReactFlow();
  const mode = useUIStore((s) => s.mode);
  const edgeData = (data ?? {}) as MovableLabelEdgeData;
  const label = typeof edgeData.label === "string" ? edgeData.label : undefined;
  const labelOffset = typeof edgeData.labelOffset === "number"
    ? edgeData.labelOffset
    : 0;
  const onLabelOffsetChange = edgeData.onLabelOffsetChange;
  const variant = edgeData.variant ?? "frame";

  const [edgePath, midX, midY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 14,
  });

  // The label position interpolates along the straight source→target line,
  // offset from the midpoint by `labelOffset`. labelOffset = 0 → midpoint;
  // ±0.45 → near the respective endpoint.
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const labelX = midX + dx * labelOffset;
  const labelY = midY + dy * labelOffset;

  const draggingRef = useRef<{ active: boolean; offset: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (mode !== "move") return;
      if (!onLabelOffsetChange) return;
      e.stopPropagation();
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      draggingRef.current = { active: true, offset: labelOffset };
    },
    [mode, labelOffset, onLabelOffsetChange],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = draggingRef.current;
      if (!drag?.active) return;
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // Project (flow - midpoint) onto the source→target direction.
      const ax = flow.x - midX;
      const ay = flow.y - midY;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1) return;
      const proj = (ax * dx + ay * dy) / len2;
      const clamped = Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, proj));
      drag.offset = clamped;
      // Notify the parent for live optimistic update during drag.
      onLabelOffsetChange?.(id, clamped);
    },
    [screenToFlowPosition, midX, midY, dx, dy, id, onLabelOffsetChange],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = draggingRef.current;
      if (!drag?.active) return;
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      draggingRef.current = null;
      // Final persist — parent canvas decides whether to flush every move
      // or only the last one (it can debounce internally).
      onLabelOffsetChange?.(id, drag.offset);
    },
    [id, onLabelOffsetChange],
  );

  const draggable = mode === "move" && !!onLabelOffsetChange;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              cursor: draggable ? "grab" : undefined,
              touchAction: draggable ? "none" : undefined,
              // React Flow's `.react-flow__edgelabel-renderer` parent sets
              // pointer-events: none for the layer, so each label must opt in
              // explicitly to receive drag events.
              pointerEvents: "auto",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className={
              variant === "crux"
                ? "nodrag nopan absolute rounded bg-[#f4f0e8] px-1.5 py-1 font-mono text-[12px] leading-[1.2] text-[#1a1a1a]" +
                  (draggable ? " ring-1 ring-[#ffc943]" : "")
                : "nodrag nopan absolute max-w-[260px] whitespace-normal rounded bg-dia-bg px-2 py-1 text-center font-mono text-[12px] leading-[1.45] text-dia-fg-muted" +
                  (draggable ? " ring-1 ring-[#ffc943]" : "")
            }
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
