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
      <CursorSvg color={cursor.color} uid={cursor.userId} />
      <span
        className="absolute left-4 top-4 whitespace-nowrap rounded-md px-1.5 py-0.5 text-black shadow-sm"
        style={{
          backgroundColor: cursor.color,
          fontSize: 12,
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        }}
      >
        {cursor.displayName}
      </span>
    </div>
  );
}

// Same Phosphor "select" arrow paths used in lib/canvas/cursors.ts —
// white silhouette underneath, collaborator color on top.
const SELECT_FILL =
  "M220.49,207.8,207.8,220.49a12,12,0,0,1-17,0l-56.57-56.57L115,214.08l-.13.33A15.84,15.84,0,0,1,100.26,224l-.78,0a15.82,15.82,0,0,1-14.41-11L32.8,52.92A15.95,15.95,0,0,1,52.92,32.8L213,85.07a16,16,0,0,1,1.41,29.8l-.33.13-50.16,19.27,56.57,56.56A12,12,0,0,1,220.49,207.8Z";
const SELECT_OUTLINE =
  "M168,132.69,214.08,115l.33-.13A16,16,0,0,0,213,85.07L52.92,32.8A15.95,15.95,0,0,0,32.8,52.92L85.07,213a15.82,15.82,0,0,0,14.41,11l.78,0a15.84,15.84,0,0,0,14.61-9.59l.13-.33L132.69,168,184,219.31a16,16,0,0,0,22.63,0l12.68-12.68a16,16,0,0,0,0-22.63ZM195.31,208,144,156.69a16,16,0,0,0-26,4.93c0,.11-.09.22-.13.32l-17.65,46L48,48l159.85,52.2-45.95,17.64-.32.13a16,16,0,0,0-4.93,26h0L208,195.31Z";

function CursorSvg({ color, uid }: { color: string; uid: string }) {
  const filterId = `rcs-${uid}`;
  return (
    <svg width="20" height="20" viewBox="0 0 256 256" style={{ display: "block" }}>
      <defs>
        <filter id={filterId}>
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="rgba(0,0,0,0.35)" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>
        <path d={SELECT_FILL} fill="white" />
        <path d={SELECT_OUTLINE} fill={color} />
      </g>
    </svg>
  );
}
