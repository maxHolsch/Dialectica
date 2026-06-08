"use client";

import { useViewport } from "@xyflow/react";

const GRID_SIZE = 40; // px at zoom=1

/**
 * Canvas background: flat #F6F4F2 with a #F0E6DC grid anchored to canvas
 * coordinates. backgroundSize scales with zoom and backgroundPosition tracks
 * pan via modulo — identical approach to the former paper texture layer.
 * Must live outside <ReactFlow> but inside ReactFlowProvider.
 */
export function PaperTextureBackground() {
  const { x, y, zoom } = useViewport();

  const tileSize = GRID_SIZE * zoom;
  const bpx = ((x % tileSize) + tileSize) % tileSize;
  const bpy = ((y % tileSize) + tileSize) % tileSize;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "#131313",
        backgroundImage: [
          "linear-gradient(#1C1C1C 1px, transparent 1px)",
          "linear-gradient(90deg, #1C1C1C 1px, transparent 1px)",
        ].join(", "),
        backgroundSize: `${tileSize}px ${tileSize}px`,
        backgroundPosition: `${bpx}px ${bpy}px`,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
