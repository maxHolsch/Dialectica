"use client";

import { useViewport } from "@xyflow/react";
import { PAPER_SVG_URI } from "@/lib/canvas/paperTexture";

// ZOOM-ADAPTIVE SEAM: to keep grain density perceptually constant, replace
// PAPER_SVG_URI with a dynamically built URI where baseFrequency = 0.05 / zoom,
// debounced ~300ms so the SVG filter only re-evaluates on zoom-end.

/**
 * Paper-texture background anchored to canvas coordinates.
 *
 * Syncs via backgroundSize (scales the tile with zoom) and backgroundPosition
 * (shifts by viewport x/y modulo the scaled tile size). This is identical in
 * effect to a translate+scale CSS transform but avoids the double-transform bug
 * that occurs when the layer is a sibling of the already-transformed RF viewport.
 *
 * Must live outside <ReactFlow> but inside ReactFlowProvider so useViewport works.
 */
export function PaperTextureBackground() {
  const { x, y, zoom } = useViewport();

  const tileSize = 700 * zoom;
  // Use positive modulo so the tile origin is always on-screen to the top-left.
  const bpx = ((x % tileSize) + tileSize) % tileSize;
  const bpy = ((y % tileSize) + tileSize) % tileSize;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: PAPER_SVG_URI,
        backgroundSize: `${tileSize}px ${tileSize}px`,
        backgroundPosition: `${bpx}px ${bpy}px`,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
