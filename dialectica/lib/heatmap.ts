// Phase 4 / DIA-VIEW-3.7 — heatmap iframe entry point.
// Centralised so the swap to a per-claim deep link is a one-line change here.

const HEATMAP_BASE_URL = "https://heatmap-nine-iota.vercel.app";

export function heatmapUrlFor(args: {
  mapId: string;
  frameId: string;
  nodeId: string;
}): string {
  // The current heatmap does not expose a per-claim API. When it does, build
  // a deep link from `args` here.
  void args;
  return HEATMAP_BASE_URL;
}
