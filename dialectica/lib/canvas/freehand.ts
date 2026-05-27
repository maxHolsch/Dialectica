import { getStroke } from "perfect-freehand";
import type { AnnotationTool, StrokePoint } from "@/lib/schema";

// Per-tool perfect-freehand parameters. Size is implied by tool per Figma (no slider).
// Tuned to give pencil ≈ thin precise stroke, pen ≈ thick ink, highlighter ≈ broad pass.
export const TOOL_PRESETS: Record<
  Exclude<AnnotationTool, "eraser" | "sticker" | "marker" | "textbox">,
  Parameters<typeof getStroke>[1] & { fillOpacity: number }
> = {
  pencil: {
    size: 4,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    fillOpacity: 1,
  },
  pen: {
    size: 8,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    fillOpacity: 1,
  },
  highlighter: {
    size: 22,
    thinning: 0,
    smoothing: 0.5,
    streamline: 0.5,
    fillOpacity: 0.35,
  },
};

export type FreehandToolName = keyof typeof TOOL_PRESETS;

// Pure pen/pencil/highlighter check — text-box and erase don't produce stroke paths.
export function isFreehandTool(tool: AnnotationTool): tool is FreehandToolName {
  return tool === "pencil" || tool === "pen" || tool === "highlighter";
}

// Canonical "stream of points → SVG path" helper from the perfect-freehand README.
// stroke is an array of [x, y] outline points; we close with Z so the path renders as a polygon.
export function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return "";
  const d = stroke.reduce(
    (acc: (string | number)[], [x0, y0]: number[], i: number, arr: number[][]) => {
      const next = arr[(i + 1) % arr.length]!;
      const [x1, y1] = next;
      acc.push(x0!, y0!, (x0! + x1!) / 2, (y0! + y1!) / 2);
      return acc;
    },
    ["M", stroke[0]![0]!, stroke[0]![1]!, "Q"],
  );
  d.push("Z");
  return d.join(" ");
}

// Convert our StrokePoint[] into perfect-freehand's [x, y, pressure] input shape.
export function toFreehandInput(
  points: StrokePoint[],
): [number, number, number][] {
  return points.map((p) => [p.x, p.y, p.pressure ?? 0.5]);
}

// Bounding box of a list of points (in any coordinate space the caller wants).
export function pointsBoundingBox(points: StrokePoint[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
