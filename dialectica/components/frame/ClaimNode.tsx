"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { Quotes } from "@phosphor-icons/react";
import { NodeHandles } from "@/components/canvas/NodeHandles";
import { useUIStore } from "@/lib/state/useUIStore";
import { InlineAgreeBar } from "./AgreeBar";
import { SNIPPET_DRAWER_DEFAULT_WIDTH } from "./SnippetDrawer";
import type { FrameNodeStakes } from "@/lib/data/stakes-types";

const BORDER = "1px solid #000";
const TILE_ZOOM = 1.5;

/**
 * Quote-mark affordance. Clicking opens the snippet drawer WITHOUT triggering
 * the canvas node-click — hence `nodrag nopan` + stopPropagation.
 * Zoom formula matches the tile-click handler in CanvasShell.
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
      className="nodrag nopan flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[#DDDDDD] bg-white text-black transition-all duration-150 hover:border-black/25"
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
          // Center tile in the visible canvas area (left of the drawer).
          const visibleCenterX = (window.innerWidth - SNIPPET_DRAWER_DEFAULT_WIDTH) / 2;
          setViewport(
            {
              x: visibleCenterX - cx * TILE_ZOOM,
              y: window.innerHeight / 2 + 50 - cy * TILE_ZOOM,
              zoom: TILE_ZOOM,
            },
            { duration: 500 },
          );
        }
      }}
    >
      <Quotes size={16} weight="regular" />
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
        borderRadius: 0,
      }}
    >
      <div className="p-8">
        <p className="font-serif text-[16px] leading-[1.5] text-black">{text}</p>
      </div>

      {/* Floating action bar — appears 16px below the tile, detached. Absolutely
          positioned so RF's ResizeObserver never sees the tile height change. */}
      {showAgree && (
        <div
          className="nodrag nopan"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "calc(100% + 16px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: expanded ? 1 : 0,
            pointerEvents: expanded ? "auto" : "none",
            transition: "opacity 150ms ease",
          }}
        >
          <InlineAgreeBar
            mapId={mapId!}
            frameId={frameId!}
            nodeId={id}
            stakes={stakes}
            userId={userId!}
            displayName={displayName!}
          />
          {hasSnippets && frameId && (
            <SnippetQuoteButton frameId={frameId} nodeId={id} count={snippetCount} />
          )}
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
        borderRadius: 0,
      }}
    >
      <div className="p-8">
        <p className="font-serif text-[16px] italic leading-[1.5] text-black">{text}</p>
      </div>

      {showAgree && (
        <div
          className="nodrag nopan"
          style={{
            position: "absolute",
            left: 0,
            top: "calc(100% + 16px)",
            opacity: expanded ? 1 : 0,
            pointerEvents: expanded ? "auto" : "none",
            transition: "opacity 150ms ease",
          }}
        >
          <InlineAgreeBar
            mapId={mapId!}
            frameId={frameId!}
            nodeId={id}
            stakes={stakes}
            userId={userId!}
            displayName={displayName!}
          />
        </div>
      )}

      <NodeHandles />
    </div>
  );
});
