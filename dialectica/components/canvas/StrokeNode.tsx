"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { type NodeProps } from "@xyflow/react";
import { getStroke } from "perfect-freehand";
import {
  TOOL_PRESETS,
  getSvgPathFromStroke,
  isFreehandTool,
  toFreehandInput,
} from "@/lib/canvas/freehand";
import type { Annotation } from "@/lib/schema";

type StrokeNodeData = {
  annotation: Annotation;
  /** True when the active canvas mode is 'erase' — adds a hover affordance. */
  eraseHover: boolean;
};

function StrokeNodeImpl({ data }: NodeProps) {
  const { annotation, eraseHover } = data as unknown as StrokeNodeData;

  if (annotation.tool === "textbox") {
    return <TextBox annotation={annotation} eraseHover={eraseHover} />;
  }

  return <FreehandStroke annotation={annotation} eraseHover={eraseHover} />;
}

export const StrokeNode = memo(StrokeNodeImpl);

function FreehandStroke({
  annotation,
  eraseHover,
}: {
  annotation: Annotation;
  eraseHover: boolean;
}) {
  const pathData = useMemo(() => {
    if (!isFreehandTool(annotation.tool)) return "";
    const preset = TOOL_PRESETS[annotation.tool];
    const stroke = getStroke(toFreehandInput(annotation.points), preset);
    return getSvgPathFromStroke(stroke);
  }, [annotation.points, annotation.tool]);

  const fillOpacity = isFreehandTool(annotation.tool)
    ? TOOL_PRESETS[annotation.tool].fillOpacity
    : 1;

  return (
    <svg
      width={annotation.width}
      height={annotation.height}
      viewBox={`0 0 ${annotation.width} ${annotation.height}`}
      style={{ overflow: "visible", pointerEvents: "none" }}
    >
      {/* invisible padded hit-rect so eraser can grab thin strokes */}
      <rect
        x={-8}
        y={-8}
        width={annotation.width + 16}
        height={annotation.height + 16}
        fill="transparent"
        style={{ pointerEvents: eraseHover ? "all" : "none" }}
      />
      <path
        d={pathData}
        fill={annotation.color}
        fillOpacity={fillOpacity}
        style={{ pointerEvents: "all" }}
      />
    </svg>
  );
}

function TextBox({
  annotation,
  eraseHover,
}: {
  annotation: Annotation;
  eraseHover: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Uncontrolled contentEditable: write the initial text once, then let the DOM own it.
  // Re-rendering the children of a contentEditable resets the caret to the start.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const initial = annotation.text && annotation.text.length > 0 ? annotation.text : "text";
    if (el.innerText !== initial) {
      el.innerText = initial;
    }
    // Focus newly-placed textbox + drop the caret at the end so the user can type/delete in place.
    el.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    // Only on mount — annotation.text is the placement-time value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      role="textbox"
      contentEditable={!eraseHover}
      suppressContentEditableWarning
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="font-mono text-[12px] leading-tight outline-none"
      style={{
        color: annotation.color,
        minWidth: annotation.width,
        minHeight: annotation.height,
        padding: 4,
        background: "transparent",
        border: eraseHover
          ? "1px dashed rgba(255,255,255,0.35)"
          : "1px dashed transparent",
        cursor: eraseHover ? "crosshair" : "text",
      }}
    />
  );
}

// In-flight stroke renderer: positioned inside the React Flow viewport via
// the same transform as nodes. Reads in-flight points from useUIStore and
// renders the current preview as the user draws.
export { InFlightStrokeLayer } from "./InFlightStrokeLayer";
