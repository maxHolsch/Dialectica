"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { getStroke } from "perfect-freehand";
import {
  TOOL_PRESETS,
  getSvgPathFromStroke,
  isFreehandTool,
  toFreehandInput,
} from "@/lib/canvas/freehand";
import { hasPendingTextFocus, clearPendingTextFocus } from "@/lib/canvas/textFocus";
import { createAnnotation, deleteAnnotation } from "@/lib/data/mutations";
import { useUIStore } from "@/lib/state/useUIStore";
import type { Annotation } from "@/lib/schema";

type StrokeNodeData = {
  annotation: Annotation;
  eraseHover: boolean;
  mapId: string;
  userId: string;
};

function StrokeNodeImpl({ data }: NodeProps) {
  const { annotation, eraseHover, mapId, userId } = data as unknown as StrokeNodeData;

  if (annotation.tool === "textbox") {
    return <TextBox annotation={annotation} eraseHover={eraseHover} mapId={mapId} userId={userId} />;
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
  const pathData = (() => {
    if (!isFreehandTool(annotation.tool)) return "";
    const preset = TOOL_PRESETS[annotation.tool];
    const stroke = getStroke(toFreehandInput(annotation.points), preset);
    return getSvgPathFromStroke(stroke);
  })();

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
  mapId,
}: {
  annotation: Annotation;
  eraseHover: boolean;
  mapId: string;
  userId: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const mode = useUIStore((s) => s.mode);
  const removeOptimistic = useUIStore((s) => s.removeOptimistic);
  const setIsEditingTextbox = useUIStore((s) => s.setIsEditingTextbox);

  useEffect(() => {
    setIsEditingTextbox(isEditing);
  }, [isEditing, setIsEditingTextbox]);

  // Set initial text content once on mount (uncontrolled contentEditable).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerText = annotation.text ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set true just before calling setIsEditing(true) so useLayoutEffect knows
  // to focus+move-caret when it sees isEditing flip to true.
  const focusOnEdit = useRef(false);

  const enterEdit = useCallback(() => {
    focusOnEdit.current = true;
    setIsEditing(true);
  }, []);

  // useLayoutEffect fires synchronously after React commits the DOM (including
  // contentEditable=true) but before the browser paints. This guarantees the
  // div is actually focusable when we call focus(), which a rAF cannot.
  useLayoutEffect(() => {
    if (!isEditing || !focusOnEdit.current) return;
    focusOnEdit.current = false;
    clearPendingTextFocus();
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }, [isEditing]);

  // Auto-enter edit mode for newly placed textboxes. hasPendingTextFocus does
  // NOT consume the token, so React StrictMode's double-invocation of effects
  // both see it; clearPendingTextFocus is called in useLayoutEffect above.
  useEffect(() => {
    if (hasPendingTextFocus(annotation.id)) {
      enterEdit();
    }
  // annotation.id is fixed; enterEdit is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotation.id]);

  const handleBlur = useCallback(async () => {
    setIsEditing(false);
    const text = ref.current?.innerText ?? "";
    // Auto-delete textboxes left empty.
    if (text.trim() === "") {
      removeOptimistic(annotation.id);
      try {
        await deleteAnnotation(mapId, annotation.id);
      } catch (err) {
        console.error("[drawing] deleteAnnotation (empty textbox) failed", err);
      }
      return;
    }
    if (text === (annotation.text ?? "")) return;
    void createAnnotation(mapId, { ...annotation, text });
  }, [annotation, mapId, removeOptimistic]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      ref.current?.blur();
    }
    // Let Enter, Backspace, etc. work naturally inside the contentEditable.
  }, []);

  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline="true"
      contentEditable={isEditing && !eraseHover}
      suppressContentEditableWarning
      onDoubleClick={(e) => {
        e.stopPropagation();
        // If already editing, let the browser handle word selection natively.
        if (!isEditing) enterEdit();
      }}
      onClick={(e) => {
        // In erase mode let the event bubble so the node-click handler can erase.
        if (eraseHover || mode === "erase") return;
        e.stopPropagation();
        if (!isEditing) enterEdit();
      }}
      onBlur={handleBlur}
      onKeyDown={isEditing ? handleKeyDown : undefined}
      onPointerDown={(e) => {
        // Prevent canvas drawing/panning from starting when editing.
        if (isEditing) e.stopPropagation();
      }}
      className="whitespace-pre-wrap break-words outline-none"
      style={{
        fontFamily: "var(--font-caveat), Caveat, cursive",
        fontSize: annotation.size,
        lineHeight: 1.35,
        color: annotation.color,
        minWidth: 80,
        padding: 4,
        background: "transparent",
        border: eraseHover
          ? "1px dashed rgba(0,0,0,0.3)"
          : isEditing
          ? "1px dashed rgba(0,0,0,0.2)"
          : "1px dashed transparent",
        cursor: eraseHover ? "crosshair" : isEditing ? "text" : undefined,
      }}
    />
  );
}

// In-flight stroke renderer: positioned inside the React Flow viewport via
// the same transform as nodes. Reads in-flight points from useUIStore and
// renders the current preview as the user draws.
export { InFlightStrokeLayer } from "./InFlightStrokeLayer";
