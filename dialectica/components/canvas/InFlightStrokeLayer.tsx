"use client";

import { useMemo } from "react";
import { useViewport } from "@xyflow/react";
import { getStroke } from "perfect-freehand";
import { useUIStore } from "@/lib/state/useUIStore";
import {
  TOOL_PRESETS,
  getSvgPathFromStroke,
  isFreehandTool,
  toFreehandInput,
} from "@/lib/canvas/freehand";

/**
 * Renders the in-progress freehand stroke during a pointer-down → pointer-up gesture.
 * The SVG fills the parent absolutely; an inner <g> applies React Flow's pan/zoom
 * via SVG transform so path coordinates (stored in flow space) land at the right
 * screen position.
 */
export function InFlightStrokeLayer() {
  const points = useUIStore((s) => s.inFlightPoints);
  const tool = useUIStore((s) => s.tool);
  const color = useUIStore((s) => s.color);
  const { x, y, zoom } = useViewport();

  const pathData = useMemo(() => {
    if (!points || points.length < 2) return "";
    if (!isFreehandTool(tool)) return "";
    const preset = TOOL_PRESETS[tool];
    const stroke = getStroke(toFreehandInput(points), preset);
    return getSvgPathFromStroke(stroke);
  }, [points, tool]);

  if (!points || points.length < 2 || !isFreehandTool(tool)) return null;
  const fillOpacity = TOOL_PRESETS[tool].fillOpacity;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[3] h-full w-full"
    >
      <g transform={`translate(${x} ${y}) scale(${zoom})`}>
        <path d={pathData} fill={color} fillOpacity={fillOpacity} />
      </g>
    </svg>
  );
}
