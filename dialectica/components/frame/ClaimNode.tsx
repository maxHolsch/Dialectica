"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeHandles } from "@/components/canvas/NodeHandles";
import { useUIStore } from "@/lib/state/useUIStore";

// Figma 52:56 — dashed selection outline. CSS outline + outline-offset wraps
// the node from the outside without affecting its layout box, so it scales
// to any width/height the node is given.
const SELECTED_OUTLINE: React.CSSProperties = {
  outline: "2px solid #a8c5e6",
  outlineOffset: 0,
  borderRadius: 12,
};

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
  const hasSnippets = (data?.hasSnippets as boolean) ?? false;
  const snippetCount = (data?.snippetCount as number) ?? 0;
  const frameId = (data?.frameId as string | undefined) ?? undefined;
  const w = width ?? 368;
  return (
    <div
      className="relative flex items-center rounded-[12px] border border-black/30 bg-white p-8"
      style={{ width: w, ...(selected ? SELECTED_OUTLINE : null) }}
    >
      <p className="font-serif text-[16px] leading-[1.5] text-black">{text}</p>
      {hasSnippets && frameId ? (
        <SnippetQuoteButton frameId={frameId} nodeId={id} count={snippetCount} />
      ) : null}
      <NodeHandles />
    </div>
  );
});

/** Pink question tile — distinguishes questions from claims at a glance. */
export const QuestionNode = memo(function QuestionNode({
  data,
  width,
}: NodeProps) {
  const text = (data?.text as string) ?? "";
  const selected = (data?.selected as boolean) ?? false;
  const w = width ?? 368;
  return (
    <div
      className="relative flex items-center rounded-[12px] border border-black/30 bg-white p-8"
      style={{ width: w, ...(selected ? SELECTED_OUTLINE : null) }}
    >
      <p className="font-serif text-[16px] italic leading-[1.5] text-black">
        {text}
      </p>
      <NodeHandles />
    </div>
  );
});
