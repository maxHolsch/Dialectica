"use client";

import { useViewport } from "@xyflow/react";
import type { RemoteCursor } from "@/lib/realtime/cursors";

/**
 * Renders other users' cursors over the React Flow canvas. Positions arrive
 * in flow-space (so they're invariant to the local user's pan/zoom); we
 * project to screen-space here using the live viewport transform.
 *
 * Must be rendered inside <ReactFlowProvider> (uses useViewport).
 */
export function RemoteCursorLayer({
  cursors,
}: {
  cursors: Record<string, RemoteCursor>;
}) {
  const viewport = useViewport();
  const list = Object.values(cursors);
  if (list.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      {list.map((c) => {
        const screenX = c.x * viewport.zoom + viewport.x;
        const screenY = c.y * viewport.zoom + viewport.y;
        return <RemoteCursorView key={c.userId} cursor={c} x={screenX} y={screenY} />;
      })}
    </div>
  );
}

function RemoteCursorView({
  cursor,
  x,
  y,
}: {
  cursor: RemoteCursor;
  x: number;
  y: number;
}) {
  return (
    <div
      className="absolute left-0 top-0 will-change-transform"
      style={{
        transform: `translate(${x}px, ${y}px)`,
        // Eases the visible jump between 25Hz broadcast frames.
        transition: "transform 80ms linear",
      }}
    >
      <CursorSvg color={cursor.color} />
      <span
        className="absolute left-4 top-4 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium text-black shadow-sm"
        style={{ backgroundColor: cursor.color }}
      >
        {cursor.displayName}
      </span>
    </div>
  );
}

// Placeholder SVG — swap with the project's cursor shape; only the `fill`
// needs to read `color`.
function CursorSvg({ color }: { color: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      style={{ display: "block" }}
    >
      <path
        d="M2 2L9 16L11 10L16 8L2 2Z"
        fill={color}
        stroke="black"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
