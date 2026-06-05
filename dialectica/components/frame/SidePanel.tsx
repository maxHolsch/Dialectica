"use client";

import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import type { ArgMap } from "@/lib/schema";
import { stakeKey, type StakeMap } from "@/lib/data/stakes-types";
import { useUIStore } from "@/lib/state/useUIStore";
import { StakeButton } from "./StakeButton";
import { StakerAvatarRow } from "./StakerAvatar";
import { StakerList } from "./StakerList";

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
  const closeSidePanel = useUIStore((s) => s.closeSidePanel);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, closeSidePanel]);

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

  return (
    <aside
      style={{ width: 320, minWidth: 320, flexShrink: 0 }}
      className="relative flex h-full min-w-0 flex-col overflow-hidden border-l border-dia-border bg-[#0a0a0a]"
      aria-label="Claim detail"
    >
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

      <div className="flex flex-1 flex-col gap-0 overflow-y-auto">
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

        {claim.node.quotes && claim.node.quotes.length > 0 && (
          <>
            <div className="border-t border-dia-border" />
            <section className="flex flex-col gap-3 px-4 py-4">
              <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-dia-fg-dim">
                Where this was said
              </span>
              <ul className="flex flex-col gap-2">
                {claim.node.quotes.map((q, i) => (
                  <li
                    key={i}
                    className="rounded-[4px] border border-dia-border-strong bg-dia-surface p-3"
                  >
                    <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[1.2px] text-dia-fg-dim">
                      Speaker {q.speaker}
                    </span>
                    <p className="font-mono text-[12px] leading-[1.6] text-dia-fg-muted">
                      &ldquo;{q.text}&rdquo;
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
