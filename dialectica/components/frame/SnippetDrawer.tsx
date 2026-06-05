"use client";

import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import type { ArgMap } from "@/lib/schema";
import { useUIStore } from "@/lib/state/useUIStore";
import { SnippetAudioPlayer } from "./SnippetAudioPlayer";

// Side-scroll drawer opened by a claim's quote-mark button. Shows the claim
// text plus its top related transcript snippets, each with an audio player that
// plays that span from the conversation recording (map.meta.audio).

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function SnippetDrawer({ map }: { map: ArgMap }) {
  const target = useUIStore((s) => s.snippetDrawerNode);
  const close = useUIStore((s) => s.closeSnippetDrawer);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, close]);

  const claim = useMemo(() => {
    if (!target) return null;
    const node = map.nodes[target.nodeId];
    if (!node) return null;
    return node;
  }, [target, map]);

  if (!target || !claim) return null;

  const snippets = [...(claim.snippets ?? [])].sort((a, b) => a.rank - b.rank);
  const audioSrc = map.meta?.audio?.publicUrl ?? null;

  return (
    <>
      {/* Click-catching backdrop — closes on outside click without blocking the
          page visually. */}
      <div
        className="fixed inset-0 z-[190]"
        aria-hidden
        onClick={close}
      />
      <aside
        aria-label="Related transcript snippets"
        className="fixed right-0 top-0 z-[200] flex h-full w-[400px] max-w-[92vw] flex-col border-l border-dia-border bg-dia-bg shadow-[-8px_0_24px_rgba(0,0,0,0.08)]"
        style={{ animation: "snippet-drawer-in 200ms ease-out" }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-dia-border px-5 pb-4 pt-5">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-dia-fg-dim">
              Where this was said
            </span>
            <p className="font-serif text-[15px] leading-[1.4] text-dia-fg">
              {claim.text}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close snippets"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-dia-fg-dim transition-colors hover:bg-dia-surface-2 hover:text-dia-fg"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-5">
          <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-dia-fg-dim">
            {snippets.length > 0
              ? `Top ${snippets.length} related ${snippets.length === 1 ? "snippet" : "snippets"}`
              : "Snippets"}
          </span>

          {snippets.length === 0 ? (
            <p className="font-mono text-[12px] leading-[1.6] text-dia-fg-dim">
              No snippets generated yet. Run the audio-snippet pipeline for this
              map from the admin panel.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {snippets.map((s, i) => (
                <li
                  key={i}
                  className="rounded-[6px] border border-dia-border-strong bg-dia-surface p-3"
                >
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-[9px] uppercase tracking-[1.2px] text-dia-fg-dim">
                      {s.speakerName}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-dia-fg-dim">
                      {clock(s.startMs)}
                    </span>
                  </div>
                  <p className="font-serif text-[13px] leading-[1.6] text-dia-fg">
                    &ldquo;{s.text}&rdquo;
                  </p>
                  {s.relevance ? (
                    <p className="mt-1.5 font-mono text-[11px] leading-[1.5] text-dia-fg-dim">
                      {s.relevance}
                    </p>
                  ) : null}
                  <div className="mt-3">
                    <SnippetAudioPlayer
                      src={audioSrc}
                      startMs={s.startMs}
                      endMs={s.endMs}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
