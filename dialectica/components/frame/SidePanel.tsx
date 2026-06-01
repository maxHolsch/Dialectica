"use client";

import { useEffect, useMemo } from "react";
import { ArrowLeft, X } from "lucide-react";
import type { ArgMap } from "@/lib/schema";
import { stakeKey, type StakeMap } from "@/lib/data/stakes-types";
import { useUIStore } from "@/lib/state/useUIStore";
import { heatmapUrlFor } from "@/lib/heatmap";
import { StakeButton } from "./StakeButton";
import { StakerAvatarRow } from "./StakerAvatar";
import { StakerList } from "./StakerList";
import { WhereWasThisSaidTrigger } from "./WhereWasThisSaidTrigger";

/**
 * Figma 34:53 — right-edge slide-out panel for a selected claim.
 *
 * Two modes:
 *   - compact: 320px wide. Shows crux header, claim text, stakes, provenance.
 *   - expanded: ~55vw wide. The panel itself becomes the heatmap iframe.
 *     The canvas shrinks to fit alongside; it is not pushed into a separate pane.
 *
 * ESC: in expanded mode → restores compact; in compact mode → closes.
 */
export function SidePanel({
  map,
  stakes,
  isEditMode,
}: {
  map: ArgMap;
  stakes: StakeMap;
  isEditMode: boolean;
}) {
  const target = useUIStore((s) => s.sidePanelNode);
  const mode = useUIStore((s) => s.sidePanelMode);
  const closeSidePanel = useUIStore((s) => s.closeSidePanel);
  const expandHeatmap = useUIStore((s) => s.expandHeatmap);
  const restoreHeatmap = useUIStore((s) => s.restoreHeatmap);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mode === "expanded") restoreHeatmap();
      else closeSidePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, mode, restoreHeatmap, closeSidePanel]);

  const claim = useMemo(() => {
    if (!target) return null;
    const frame = map.frames[target.frameId];
    const node = map.nodes[target.nodeId];
    if (!frame || !node) return null;
    const cruxQuestion =
      frame.cruxId === "top"
        ? map.topQuestion
        : (map.cruxes.find((c) => c.id === frame.cruxId)?.question ?? "");
    return { node, frame, cruxQuestion };
  }, [target, map]);

  if (!target || !claim) return null;

  const bucket = stakes[stakeKey(target.frameId, target.nodeId)] ?? {
    count: 0,
    stakers: [],
    selfStaked: false,
  };

  // Inline style for width avoids the flex `min-width: auto` default that would
  // let inner min-content (e.g. the trigger pill row) widen the panel past w-[320px].
  const widthStyle: React.CSSProperties =
    mode === "expanded"
      ? { width: "55vw", minWidth: 480, maxWidth: 1100, flexShrink: 0 }
      : { width: 320, minWidth: 320, flexShrink: 0 };

  return (
    <aside
      style={widthStyle}
      className="relative flex h-full min-w-0 flex-col overflow-hidden border-l border-dia-border bg-[#0a0a0a]"
      aria-label="Claim detail"
    >
      {mode === "expanded" ? (
        <HeatmapMode
          mapId={map.id}
          frameId={target.frameId}
          nodeId={target.nodeId}
          onBack={restoreHeatmap}
          onClose={closeSidePanel}
        />
      ) : (
        <>
          <header className="flex items-start justify-between gap-3 px-4 pt-4">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-dia-fg-dim">
                Crux
              </span>
              <p className="line-clamp-2 font-mono text-[11px] leading-tight text-dia-fg-muted">
                {claim.cruxQuestion}
              </p>
            </div>
            <button
              type="button"
              onClick={closeSidePanel}
              aria-label="Close side panel"
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-dia-fg-dim transition-colors hover:bg-dia-surface-2 hover:text-dia-fg"
            >
              <X className="size-4" strokeWidth={1.5} />
            </button>
          </header>

          <div className="mt-4 border-t border-dia-border" />

          <section className="flex flex-col gap-3 px-4 py-4">
            <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-dia-fg-dim">
              {claim.node.type === "question" ? "Question" : "Claim"}
            </span>
            <p
              className={
                "font-mono text-[13px] leading-[1.5] text-dia-fg " +
                (claim.node.type === "question" ? "italic" : "")
              }
            >
              {claim.node.text}
            </p>
          </section>

          <div className="border-t border-dia-border" />

          <section className="flex flex-col gap-3 px-4 py-4">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-dia-fg-dim">
                Stand behind
              </span>
              <span className="font-mono text-[18px] tabular-nums text-dia-fg">
                {bucket.count}
              </span>
            </div>
            <StakeButton
              mapId={map.id}
              frameId={target.frameId}
              nodeId={target.nodeId}
              selfStaked={bucket.selfStaked}
            />
            {bucket.stakers.length > 0 && (
              <StakerAvatarRow stakers={bucket.stakers} />
            )}
            <StakerList stakers={bucket.stakers} isEditMode={isEditMode} />
          </section>

          <div className="mt-auto px-4 pb-4 pt-4">
            <WhereWasThisSaidTrigger onActivate={expandHeatmap} />
          </div>
        </>
      )}
    </aside>
  );
}

function HeatmapMode({
  mapId,
  frameId,
  nodeId,
  onBack,
  onClose,
}: {
  mapId: string;
  frameId: string;
  nodeId: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const url = heatmapUrlFor({ mapId, frameId, nodeId });
  return (
    <>
      <header className="flex h-10 items-center justify-between border-b border-dia-border px-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded font-mono text-[10px] uppercase tracking-[1.5px] text-dia-fg-dim transition-colors hover:text-dia-fg"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.5} />
          Back to claim
        </button>
        <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-dia-fg-dim">
          Heatmap · where this was said
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="flex size-6 items-center justify-center rounded text-dia-fg-dim transition-colors hover:bg-dia-surface-2 hover:text-dia-fg"
        >
          <X className="size-3.5" strokeWidth={1.5} />
        </button>
      </header>
      <iframe
        src={url}
        title="Heatmap"
        className="h-full w-full flex-1 border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </>
  );
}
