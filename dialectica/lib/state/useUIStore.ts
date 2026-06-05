"use client";

import { create } from "zustand";
import type { Annotation, StrokePoint } from "@/lib/schema";

export type CanvasMode = "select" | "draw" | "erase" | "move";
export type DrawingTool = "pencil" | "pen" | "highlighter" | "textbox";

export const SWATCHES = ["#0D90D3", "#54A96D", "#F4652C", "#885CBF"];

type HistoryAction =
  | { type: "create"; annotation: Annotation }
  | { type: "delete"; annotation: Annotation }
  | { type: "clear"; annotations: Annotation[] };

// Phase 4 — side panel + heatmap split view. Stakes attach to a frame instance,
// so the side panel always knows the (frameId, nodeId) pair it was opened from.
export type SidePanelTarget = { frameId: string; nodeId: string };
export type SidePanelMode = "compact" | "expanded";
// Dialectica-side width of the split. Clamped to [0.15, 0.85] per PRD §5.4.
export const HEATMAP_SPLIT_MIN = 0.15;
export const HEATMAP_SPLIT_MAX = 0.85;
export const HEATMAP_SPLIT_DEFAULT = 0.25;

type UIStore = {
  // Mode + tool selection
  mode: CanvasMode;
  tool: DrawingTool;
  color: string;
  setMode: (mode: CanvasMode) => void;
  setTool: (tool: DrawingTool) => void;
  setColor: (color: string) => void;

  // Current map context — used to reset local state on map switch
  activeMapId: string | null;
  bindMap: (mapId: string) => void;

  // Side panel (Phase 4) — null when no claim is selected.
  sidePanelNode: SidePanelTarget | null;
  sidePanelMode: SidePanelMode;
  heatmapSplit: number; // 0..1, Dialectica-side width fraction
  openSidePanel: (target: SidePanelTarget) => void;
  closeSidePanel: () => void;
  expandHeatmap: () => void;
  restoreHeatmap: () => void;
  setHeatmapSplit: (fraction: number) => void;

  // Optimistic annotation layer keyed by id. Live on top of the server-loaded
  // annotations from props; we merge by id when rendering.
  optimisticAdds: Record<string, Annotation>;
  optimisticDeletes: Record<string, true>;
  addOptimistic: (annotation: Annotation) => void;
  removeOptimistic: (id: string) => void;

  // In-flight stroke being drawn right now (before commit).
  inFlightPoints: StrokePoint[] | null;
  startStroke: (firstPoint: StrokePoint) => void;
  appendStrokePoint: (p: StrokePoint) => void;
  endStroke: () => StrokePoint[] | null; // returns the collected points and clears in-flight

  // Undo / redo (session-local)
  history: HistoryAction[];
  cursor: number; // index of next un-redone action; history[0..cursor-1] are "applied"
  pushHistory: (action: HistoryAction) => void;
  undo: () => HistoryAction | null;
  redo: () => HistoryAction | null;
};

export const useUIStore = create<UIStore>((set, get) => ({
  mode: "select",
  tool: "pen",
  color: "#0D90D3",
  setMode: (mode) => set({ mode }),
  setTool: (tool) => set({ tool, mode: "draw" }),
  setColor: (color) => set({ color }),

  activeMapId: null,
  bindMap: (mapId) => {
    if (get().activeMapId === mapId) return;
    set({
      activeMapId: mapId,
      optimisticAdds: {},
      optimisticDeletes: {},
      inFlightPoints: null,
      history: [],
      cursor: 0,
      sidePanelNode: null,
      sidePanelMode: "compact",
      heatmapSplit: HEATMAP_SPLIT_DEFAULT,
    });
  },

  sidePanelNode: null,
  sidePanelMode: "compact",
  heatmapSplit: HEATMAP_SPLIT_DEFAULT,
  openSidePanel: (target) =>
    set({ sidePanelNode: target, sidePanelMode: "compact" }),
  closeSidePanel: () =>
    set({ sidePanelNode: null, sidePanelMode: "compact" }),
  expandHeatmap: () => set({ sidePanelMode: "expanded" }),
  restoreHeatmap: () => set({ sidePanelMode: "compact" }),
  setHeatmapSplit: (fraction) =>
    set({
      heatmapSplit: Math.min(
        HEATMAP_SPLIT_MAX,
        Math.max(HEATMAP_SPLIT_MIN, fraction),
      ),
    }),

  optimisticAdds: {},
  optimisticDeletes: {},
  addOptimistic: (annotation) =>
    set((s) => ({
      optimisticAdds: { ...s.optimisticAdds, [annotation.id]: annotation },
      optimisticDeletes: removeKey(s.optimisticDeletes, annotation.id),
    })),
  removeOptimistic: (id) =>
    set((s) => ({
      optimisticDeletes: { ...s.optimisticDeletes, [id]: true },
      optimisticAdds: removeKey(s.optimisticAdds, id),
    })),

  inFlightPoints: null,
  startStroke: (firstPoint) => set({ inFlightPoints: [firstPoint] }),
  appendStrokePoint: (p) =>
    set((s) =>
      s.inFlightPoints
        ? { inFlightPoints: [...s.inFlightPoints, p] }
        : { inFlightPoints: null },
    ),
  endStroke: () => {
    const pts = get().inFlightPoints;
    set({ inFlightPoints: null });
    return pts;
  },

  history: [],
  cursor: 0,
  pushHistory: (action) =>
    set((s) => {
      const trimmed = s.history.slice(0, s.cursor);
      const next = [...trimmed, action];
      return { history: next, cursor: next.length };
    }),
  undo: () => {
    const { history, cursor } = get();
    if (cursor === 0) return null;
    const action = history[cursor - 1]!;
    set({ cursor: cursor - 1 });
    return action;
  },
  redo: () => {
    const { history, cursor } = get();
    if (cursor >= history.length) return null;
    const action = history[cursor]!;
    set({ cursor: cursor + 1 });
    return action;
  },
}));

function removeKey<T>(
  obj: Record<string, T>,
  key: string,
): Record<string, T> {
  if (!(key in obj)) return obj;
  const rest = { ...obj };
  delete rest[key];
  return rest;
}
