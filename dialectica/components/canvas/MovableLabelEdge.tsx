"use client";

import { useCallback, useMemo, useRef } from "react";
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

const clampOffset = (o: number) =>
  Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, o));

// Stored offset is centered at 0 (midpoint) with range ±0.45. Convert to a
// fraction of total path length where 0 = source end, 1 = target end.
const offsetToFraction = (offset: number) => 0.5 + clampOffset(offset);

/**
 * Smooth-step edge with an HTML label rendered on top. In move mode the label
 * becomes draggable along the actual rendered path (including any kinks);
 * the parent canvas persists the resulting offset to the map JSON.
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
  selected,
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

  // Detached <path> used purely for SVG geometry (getTotalLength /
  // getPointAtLength) so the label can travel along the real rendered curve,
  // including the corners produced by smooth-step routing. Rebuilt only when
  // the path string itself changes.
  const pathMetrics = useMemo(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    el.setAttribute("d", edgePath);
    return { el, length: el.getTotalLength() };
  }, [edgePath]);

  const { labelX, labelY } = useMemo(() => {
    if (!pathMetrics || pathMetrics.length === 0) {
      return { labelX: midX, labelY: midY };
    }
    const pt = pathMetrics.el.getPointAtLength(
      pathMetrics.length * offsetToFraction(labelOffset),
    );
    return { labelX: pt.x, labelY: pt.y };
  }, [pathMetrics, labelOffset, midX, midY]);

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
      if (!pathMetrics || pathMetrics.length === 0) return;
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      // Find the path-length fraction whose point is closest to the pointer.
      // Coarse sweep then a local refinement keeps the search cheap while
      // tracking kinked smooth-step paths exactly.
      const { el, length } = pathMetrics;
      const coarse = 80;
      let bestT = 0.5;
      let bestDist = Infinity;
      for (let i = 0; i <= coarse; i += 1) {
        const t = i / coarse;
        const pt = el.getPointAtLength(length * t);
        const ddx = pt.x - flow.x;
        const ddy = pt.y - flow.y;
        const d = ddx * ddx + ddy * ddy;
        if (d < bestDist) {
          bestDist = d;
          bestT = t;
        }
      }
      const refineSpan = 1 / coarse;
      const refineSteps = 10;
      for (let i = -refineSteps; i <= refineSteps; i += 1) {
        const t = bestT + (i / refineSteps) * refineSpan;
        if (t < 0 || t > 1) continue;
        const pt = el.getPointAtLength(length * t);
        const ddx = pt.x - flow.x;
        const ddy = pt.y - flow.y;
        const d = ddx * ddx + ddy * ddy;
        if (d < bestDist) {
          bestDist = d;
          bestT = t;
        }
      }

      const clamped = clampOffset(bestT - 0.5);
      drag.offset = clamped;
      onLabelOffsetChange?.(id, clamped);
    },
    [pathMetrics, screenToFlowPosition, id, onLabelOffsetChange],
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

  // When the user clicks to select an edge, paint it pure white so the
  // selection is obvious against the dark canvas. The stroke reverts to the
  // edge's normal style as soon as it's deselected.
  const effectiveStyle = selected
    ? { ...(style ?? {}), stroke: "#ffffff", strokeWidth: 2 }
    : style;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={effectiveStyle} />
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
