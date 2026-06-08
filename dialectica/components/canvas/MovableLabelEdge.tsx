"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getStraightPath,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  Position,
  type EdgeProps,
} from "@xyflow/react";
import { useUIStore } from "@/lib/state/useUIStore";

type MovableLabelEdgeData = {
  label?: string;
  /** Longer relationship description shown in the expanded pill (frame view only). */
  relType?: string;
  labelOffset?: number;
  curvature?: number;
  /** Persist the new offset when the user releases a label drag. */
  onLabelOffsetChange?: (edgeId: string, offset: number) => void;
  /** Map a CSS style flag — pink for crux view, dimmed mono for frame view. */
  variant?: "crux" | "frame";
};

const OFFSET_MIN = -0.45;
const OFFSET_MAX = 0.45;

const clampOffset = (o: number) =>
  Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, o));

const offsetToFraction = (offset: number) => 0.5 + clampOffset(offset);

export function MovableLabelEdge({
  id,
  source,
  target,
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
  const { screenToFlowPosition, setViewport, getNode } = useReactFlow();
  const mode = useUIStore((s) => s.mode);
  const expandedEdgeId = useUIStore((s) => s.expandedEdgeId);
  const setExpandedEdgeId = useUIStore((s) => s.setExpandedEdgeId);
  const edgeData = (data ?? {}) as MovableLabelEdgeData;
  const label = typeof edgeData.label === "string" ? edgeData.label : undefined;
  const relType = typeof edgeData.relType === "string" ? edgeData.relType : undefined;
  const labelOffset = typeof edgeData.labelOffset === "number"
    ? edgeData.labelOffset
    : 0;
  const onLabelOffsetChange = edgeData.onLabelOffsetChange;
  const variant = edgeData.variant ?? "frame";
  const curvature = typeof edgeData.curvature === "number" ? edgeData.curvature : 0;
  const isExpanded = expandedEdgeId === id;

  // Local hover state — shows expanded pill but does NOT trigger fitView or fade.
  const [isHovered, setIsHovered] = useState(false);
  const isExpandedOrHovered = isExpanded || isHovered;

  // Delay the text swap so the pill grows visually before the copy changes.
  // On collapse, revert immediately so the short label is ready as it shrinks.
  const [showFull, setShowFull] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isExpandedOrHovered) {
      timer = setTimeout(() => setShowFull(true), 110);
    } else {
      setShowFull(false);
    }
    return () => clearTimeout(timer);
  }, [isExpandedOrHovered]);

  // Axially-aligned connections (endpoints differ only on one axis) draw as
  // straight lines. Diagonal connections get a bezier so the convergent fan-in
  // of multiple edges arriving at the same tile curves gracefully.
  const DIAGONAL_PX = 40;
  const isDiagonal =
    Math.abs(targetX - sourceX) > DIAGONAL_PX &&
    Math.abs(targetY - sourceY) > DIAGONAL_PX;

  const [edgePath, midX, midY] = isDiagonal
    ? getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: curvature || 0.25 })
    : getStraightPath({ sourceX, sourceY, targetX, targetY });

  const pathMetrics = useMemo(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
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
        if (d < bestDist) { bestDist = d; bestT = t; }
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
        if (d < bestDist) { bestDist = d; bestT = t; }
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
      onLabelOffsetChange?.(id, drag.offset);
    },
    [id, onLabelOffsetChange],
  );

  const draggable = mode === "move" && !!onLabelOffsetChange;
  const interactive = mode === "select" && variant === "frame" && !!label;

  // Dim this pill when a different edge label is click-expanded.
  // Hovering over a dimmed pill lifts the dim so the user can still read it.
  const dimmed = expandedEdgeId !== null && expandedEdgeId !== id && !isHovered;

  const handleLabelClick = useCallback(
    (e: React.MouseEvent) => {
      if (!interactive) return;
      e.stopPropagation();
      if (isExpanded) {
        setExpandedEdgeId(null);
      } else {
        setExpandedEdgeId(id);
        // Single viewport animation to the two connected tiles — avoids the
        // zoom-out artefact that fitView() produces when the current zoom
        // doesn't match the target zoom.
        const srcNode = getNode(source);
        const tgtNode = getNode(target);
        if (srcNode && tgtNode) {
          const bounds = getNodesBounds([srcNode, tgtNode]);
          const vp = getViewportForBounds(
            bounds,
            window.innerWidth,
            window.innerHeight,
            0.5,
            1.5,
            0.5,
          );
          setViewport({ ...vp, y: vp.y + 50 }, { duration: 400 });
        }
      }
    },
    [interactive, isExpanded, setExpandedEdgeId, id, getNode, source, target, setViewport],
  );

  const handleMouseEnter = useCallback(() => {
    if (interactive) setIsHovered(true);
  }, [interactive]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const effectiveStyle = selected
    ? { ...(style ?? {}), stroke: "#ffffff", strokeWidth: 2 }
    : style;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={effectiveStyle} />
      {label ? (
        <EdgeLabelRenderer>
          {/* Outer div: positioning + pointer events only */}
          <div
            className="nodrag nopan absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              cursor: draggable ? "grab" : interactive ? "pointer" : undefined,
              touchAction: draggable ? "none" : undefined,
              pointerEvents: "auto",
              zIndex: isExpandedOrHovered ? 50 : undefined,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={handleLabelClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {variant === "crux" ? (
              <div
                className={
                  "rounded bg-[#131313] px-1.5 py-1 font-mono text-[12px] leading-[1.2] text-[#D0D0D0]" +
                  (draggable ? " ring-1 ring-[#ffc943]" : "")
                }
              >
                {label}
              </div>
            ) : (
              /* Inner div: visual pill that morphs smoothly between states */
              <div
                className="font-serif italic text-[12px] leading-[1.45] select-none"
                style={{
                  transition: [
                    "max-width 180ms cubic-bezier(0.25,0.1,0.25,1)",
                    "padding 160ms ease",
                    "border-color 150ms ease",
                    "border-radius 180ms ease",
                    "color 140ms ease",
                    "opacity 200ms ease",
                  ].join(", "),
                  maxWidth: isExpandedOrHovered ? "320px" : "80px",
                  padding: isExpandedOrHovered ? "8px 16px" : "2px 8px",
                  borderRadius: isExpandedOrHovered ? "9999px" : "4px",
                  border: "1px solid",
                  borderColor: isExpandedOrHovered ? "#555555" : "transparent",
                  backgroundColor: "#131313",
                  color: "#D0D0D0",
                  overflow: "hidden",
                  whiteSpace: showFull ? "normal" : "nowrap",
                  textAlign: "center",
                  opacity: dimmed ? 0.12 : 1,
                  ...(draggable ? { outline: "1px solid #ffc943", outlineOffset: "1px" } : {}),
                }}
              >
                {showFull ? label : relType}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
