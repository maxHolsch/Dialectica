"use client";

import { useViewport } from "@xyflow/react";

const PAPER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svgjs="http://svgjs.dev/svgjs" viewBox="0 0 700 700" width="700" height="700" opacity="0.94"><defs><filter id="nnnoise-filter" x="-20%" y="-20%" width="140%" height="140%" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse" color-interpolation-filters="linearRGB"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="4" seed="15" stitchTiles="stitch" x="0%" y="0%" width="100%" height="100%" result="turbulence"></feTurbulence><feSpecularLighting surfaceScale="3" specularConstant="1.1" specularExponent="20" lighting-color="#9CA2A7" x="0%" y="0%" width="100%" height="100%" in="turbulence" result="specularLighting"><feDistantLight azimuth="3" elevation="61"></feDistantLight></feSpecularLighting></filter></defs><rect width="700" height="700" fill="transparent"></rect><rect width="700" height="700" fill="#cccccc" filter="url(#nnnoise-filter)"></rect></svg>`;

const PAPER_SVG_URI = `url("data:image/svg+xml,${encodeURIComponent(PAPER_SVG)}")`;

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
