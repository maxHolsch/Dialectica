"use client";

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import { useUIStore, type DrawingTool } from "@/lib/state/useUIStore";
import { isFreehandTool, pointsBoundingBox } from "@/lib/canvas/freehand";
import type { Annotation, StrokePoint } from "@/lib/schema";
import { createAnnotation, deleteAnnotation } from "@/lib/data/mutations";

type Options = {
  mapId: string;
  frameId?: string;
  userId: string;
};

function newAnnotationId() {
  return `ann-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

// Builds an Annotation from collected flow-space points.
function buildAnnotation({
  points,
  tool,
  color,
  frameId,
  userId,
}: {
  points: StrokePoint[];
  tool: DrawingTool;
  color: string;
  frameId?: string;
  userId: string;
}): Annotation {
  const { minX, minY, maxX, maxY } = pointsBoundingBox(points);
  // Store points relative to bounding-box origin so the node renders in local coords.
  const relativePoints = points.map((p) => ({
    x: p.x - minX,
    y: p.y - minY,
    t: p.t,
    pressure: p.pressure,
  }));
  return {
    id: newAnnotationId(),
    frameId,
    points: relativePoints,
    tool,
    color,
    size: defaultSizeFor(tool),
    origin: { x: minX, y: minY },
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    userId,
    createdAt: new Date().toISOString(),
  };
}

function defaultSizeFor(tool: DrawingTool): number {
  switch (tool) {
    case "pencil":
      return 4;
    case "pen":
      return 8;
    case "highlighter":
      return 22;
    case "textbox":
      return 14;
  }
}

export function useDrawingHandlers({ mapId, frameId, userId }: Options) {
  const { screenToFlowPosition } = useReactFlow();
  const mode = useUIStore((s) => s.mode);
  const tool = useUIStore((s) => s.tool);
  const color = useUIStore((s) => s.color);
  const setMode = useUIStore((s) => s.setMode);
  const startStroke = useUIStore((s) => s.startStroke);
  const appendStrokePoint = useUIStore((s) => s.appendStrokePoint);
  const endStroke = useUIStore((s) => s.endStroke);
  const addOptimistic = useUIStore((s) => s.addOptimistic);
  const removeOptimistic = useUIStore((s) => s.removeOptimistic);
  const pushHistory = useUIStore((s) => s.pushHistory);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (mode !== "draw") return;
      if (!isFreehandTool(tool)) return; // textbox handled separately
      // Only the primary button initiates a stroke.
      if (e.button !== 0) return;
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      startStroke({
        x: flow.x,
        y: flow.y,
        t: e.timeStamp,
        pressure: e.pressure || 0.5,
      });
    },
    [mode, tool, screenToFlowPosition, startStroke],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (mode !== "draw") return;
      if (!isFreehandTool(tool)) return;
      // buttons === 1 == primary button held
      if (e.buttons !== 1) return;
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      appendStrokePoint({
        x: flow.x,
        y: flow.y,
        t: e.timeStamp,
        pressure: e.pressure || 0.5,
      });
    },
    [mode, tool, screenToFlowPosition, appendStrokePoint],
  );

  const onPointerUp = useCallback(
    async (e: ReactPointerEvent<HTMLDivElement>) => {
      if (mode !== "draw") return;
      if (!isFreehandTool(tool)) return;
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      const points = endStroke();
      if (!points || points.length < 2) return;

      const annotation = buildAnnotation({
        points,
        tool,
        color,
        frameId,
        userId,
      });
      addOptimistic(annotation);
      pushHistory({ type: "create", annotation });
      try {
        await createAnnotation(mapId, annotation);
      } catch (err) {
        console.error("[drawing] createAnnotation failed", err);
      }
    },
    [
      mode,
      tool,
      color,
      frameId,
      userId,
      endStroke,
      addOptimistic,
      pushHistory,
      mapId,
    ],
  );

  // For text-box: a click commits a single-position annotation with placeholder text
  // ("text"); the StrokeNode for textbox tools focuses the new box for inline edit.
  // After commit we switch back to select/move mode so a stray second click doesn't
  // create another textbox.
  const onPaneClick = useCallback(
    async (e: ReactMouseEvent<HTMLDivElement>) => {
      if (mode !== "draw" || tool !== "textbox") return;
      e.stopPropagation();
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const annotation: Annotation = {
        id: newAnnotationId(),
        frameId,
        points: [],
        tool: "textbox",
        color,
        size: defaultSizeFor("textbox"),
        origin: flow,
        width: 160,
        height: 32,
        text: "text",
        userId,
        createdAt: new Date().toISOString(),
      };
      addOptimistic(annotation);
      pushHistory({ type: "create", annotation });
      setMode("select");
      try {
        await createAnnotation(mapId, annotation);
      } catch (err) {
        console.error("[drawing] createAnnotation (textbox) failed", err);
      }
    },
    [
      mode,
      tool,
      color,
      frameId,
      userId,
      screenToFlowPosition,
      addOptimistic,
      pushHistory,
      setMode,
      mapId,
    ],
  );

  // Hook returned for the parent to wire onto the canvas wrapper div.
  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPaneClick,
    // Eraser dispatch: called by CanvasShell.onNodeClick when mode === 'erase'.
    eraseAnnotation: useCallback(
      async (annotation: Annotation) => {
        removeOptimistic(annotation.id);
        pushHistory({ type: "delete", annotation });
        try {
          await deleteAnnotation(mapId, annotation.id);
        } catch (err) {
          console.error("[drawing] deleteAnnotation failed", err);
        }
      },
      [mapId, removeOptimistic, pushHistory],
    ),
  };
}
