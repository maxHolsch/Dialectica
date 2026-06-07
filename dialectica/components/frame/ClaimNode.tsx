"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { NodeHandles } from "@/components/canvas/NodeHandles";
import { useUIStore } from "@/lib/state/useUIStore";
import { InlineAgreeBar } from "./AgreeBar";
import type { FrameNodeStakes } from "@/lib/data/stakes-types";

const BORDER = "1px solid rgba(0,0,0,0.3)";

/**
 * Quote-mark affordance, bottom-right. Visible only when the claim has audio
 * snippets. Clicking opens the snippet drawer WITHOUT triggering the canvas
 * node-click (zoom/side-panel) — hence `nodrag nopan` + stopPropagation.
 */
function SnippetQuoteButton({
  frameId,
  nodeId,
  count,
}: {
  frameId: string;
  nodeId: string;
  count: number;
}) {
  const openSnippetDrawer = useUIStore((s) => s.openSnippetDrawer);
  const openSidePanel = useUIStore((s) => s.openSidePanel);
  const { getNode, setViewport } = useReactFlow();
  const label =
    count > 0
      ? `Top ${count} related ${count === 1 ? "snippet" : "snippets"}`
      : "Where this was said";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="nodrag nopan absolute bottom-2 right-3 flex h-8 w-8 items-end justify-center leading-none text-black/35 transition-colors hover:text-black"
      style={{ fontFamily: "var(--font-quote)", fontSize: 34 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        openSidePanel({ frameId, nodeId });
        openSnippetDrawer({ frameId, nodeId });
        const node = getNode(nodeId);
        if (node) {
          const nodeW = (node.measured?.width ?? node.width ?? 368) as number;
          const nodeH = (node.measured?.height ?? node.height ?? 300) as number;
          const cx = node.position.x + nodeW / 2;
          const cy = node.position.y + nodeH / 2;
          setViewport(
            { x: window.innerWidth / 2 - cx, y: window.innerHeight / 2 + 50 - cy, zoom: 0.85 },
            { duration: 500 },
          );
        }
      }}
    >
      &ldquo;
    </button>
  );
}

/** Solid mint claim tile in the frame view. Figma node 2:15. */
export const ClaimNode = memo(function ClaimNode({
  id,
  data,
  width,
}: NodeProps) {
  const text = (data?.text as string) ?? "";
  const selected = (data?.selected as boolean) ?? false;
  const hovered = (data?.hovered as boolean) ?? false;
  const expanded = selected || hovered;

  const hasSnippets = (data?.hasSnippets as boolean) ?? false;
  const snippetCount = (data?.snippetCount as number) ?? 0;
  const stakes = data?.stakes as FrameNodeStakes | undefined;
  const userId = data?.userId as string | undefined;
  const displayName = data?.displayName as string | undefined;
  const mapId = data?.mapId as string | undefined;
  const frameId = (data?.frameId as string | undefined) ?? undefined;
  const showAgree = !!(mapId && frameId && userId && displayName);

  const w = width ?? 368;

  return (
    <div
      className="relative flex items-center bg-white"
      style={{
        width: w,
        border: BORDER,
        // Flatten bottom corners when expanded so the extension looks seamless.
        borderRadius: expanded ? "12px 12px 0 0" : "12px",
        transition: "border-radius 200ms ease",
      }}
    >
      <div className="p-8">
        <p className="font-serif text-[16px] leading-[1.5] text-black">{text}</p>
      </div>
      {hasSnippets && frameId ? (
        <SnippetQuoteButton frameId={frameId} nodeId={id} count={snippetCount} />
      ) : null}

      {/* Absolutely positioned so RF's ResizeObserver never sees a height change,
          keeping edge endpoints fixed as the tile expands. */}
      {showAgree && (
        <div
          style={{
            position: "absolute",
            left: -1,
            right: -1,
            // Overlap the main tile's bottom border by 1px to avoid a double line.
            top: "calc(100% - 1px)",
            maxHeight: expanded ? 100 : 0,
            opacity: expanded ? 1 : 0,
            overflow: "hidden",
            transition: "max-height 200ms ease, opacity 150ms ease",
            borderLeft: BORDER,
            borderRight: BORDER,
            borderBottom: BORDER,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12,
            background: "white",
          }}
        >
          <div style={{ padding: "0 32px 32px" }}>
            <InlineAgreeBar
              mapId={mapId!}
              frameId={frameId!}
              nodeId={id}
              stakes={stakes}
              userId={userId!}
              displayName={displayName!}
            />
          </div>
        </div>
      )}

      <NodeHandles />
    </div>
  );
});

/** Pink question tile — distinguishes questions from claims at a glance. */
export const QuestionNode = memo(function QuestionNode({ id, data, width }: NodeProps) {
  const text = (data?.text as string) ?? "";
  const selected = (data?.selected as boolean) ?? false;
  const hovered = (data?.hovered as boolean) ?? false;
  const expanded = selected || hovered;

  const stakes = data?.stakes as FrameNodeStakes | undefined;
  const userId = data?.userId as string | undefined;
  const displayName = data?.displayName as string | undefined;
  const mapId = data?.mapId as string | undefined;
  const frameId = data?.frameId as string | undefined;
  const showAgree = !!(mapId && frameId && userId && displayName);

  const w = width ?? 368;

  return (
    <div
      className="relative flex items-center bg-white"
      style={{
        width: w,
        border: BORDER,
        borderRadius: expanded ? "12px 12px 0 0" : "12px",
        transition: "border-radius 200ms ease",
      }}
    >
      <div className="p-8">
        <p className="font-serif text-[16px] italic leading-[1.5] text-black">{text}</p>
      </div>

      {showAgree && (
        <div
          style={{
            position: "absolute",
            left: -1,
            right: -1,
            top: "calc(100% - 1px)",
            maxHeight: expanded ? 100 : 0,
            opacity: expanded ? 1 : 0,
            overflow: "hidden",
            transition: "max-height 200ms ease, opacity 150ms ease",
            borderLeft: BORDER,
            borderRight: BORDER,
            borderBottom: BORDER,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12,
            background: "white",
          }}
        >
          <div style={{ padding: "0 32px 32px" }}>
            <InlineAgreeBar
              mapId={mapId!}
              frameId={frameId!}
              nodeId={id}
              stakes={stakes}
              userId={userId!}
              displayName={displayName!}
            />
          </div>
        </div>
      )}

      <NodeHandles />
    </div>
  );
});
