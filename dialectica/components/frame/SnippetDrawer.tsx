"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ArgMap } from "@/lib/schema";
import { useUIStore } from "@/lib/state/useUIStore";
import { SnippetAudioPlayer } from "./SnippetAudioPlayer";

// Side-scroll drawer opened by a claim's quote-mark button. Shows the claim
// text plus its top related transcript snippets, each with an audio player that
// plays that span from the conversation recording (map.meta.audio).

export const SNIPPET_DRAWER_DEFAULT_WIDTH = 560;

// Card palettes cycled per-snippet. Background + foreground pair; foreground
// is also used (at lower opacity) for borders and the audio-player tint.
const SNIPPET_PALETTES: { bg: string; fg: string }[] = [
  { bg: "#F4652C", fg: "#FFFFFF" },
  { bg: "#F6ECD9", fg: "#524834" },
  { bg: "#F4E8F6", fg: "#3C3452" },
  { bg: "#D5EAE8", fg: "#000000" },
  { bg: "#0D90D3", fg: "#FFFFFF" },
  { bg: "#54A96D", fg: "#FFFFFF" },
  { bg: "#431E00", fg: "#FFF8EE" },
];

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export const DRAWER_ANIM_MS = 260;

export function SnippetDrawer({ map }: { map: ArgMap }) {
  const target = useUIStore((s) => s.snippetDrawerNode);
  const closeStore = useUIStore((s) => s.closeSnippetDrawer);
  const closeSidePanel = useUIStore((s) => s.closeSidePanel);
  const [exiting, setExiting] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    closeSidePanel();
    exitTimerRef.current = setTimeout(() => {
      closeStore();
      setExiting(false);
      exitTimerRef.current = null;
    }, DRAWER_ANIM_MS);
  }, [exiting, closeStore, closeSidePanel]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);
  const hasAudio = !!map.meta?.audio?.path;
  // Drawer width — defaults to 560px (40% wider than the original 400px).
  // Drag the left edge to resize between 360px and 90vw.
  const [width, setWidth] = useState(SNIPPET_DRAWER_DEFAULT_WIDTH);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragRef.current = { startX: e.clientX, startWidth: width };
    },
    [width],
  );

  const onResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    // Drawer is anchored to the right, so dragging left grows it.
    const next = d.startWidth + (d.startX - e.clientX);
    const max = Math.max(360, window.innerWidth * 0.92);
    setWidth(Math.min(max, Math.max(360, next)));
  }, []);

  const onResizeEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragRef.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    },
    [],
  );
  // Signed URL for the recording, minted once per map when the drawer first
  // opens. `undefined` = not fetched yet, `null` = no audio / failed.
  const [audioSrc, setAudioSrc] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, close]);

  // Fetch the signed audio URL the first time the drawer opens for this map.
  useEffect(() => {
    if (!target || !hasAudio || audioSrc !== undefined) return;
    let cancelled = false;
    fetch(`/api/maps/${encodeURIComponent(map.id)}/audio`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { url?: string } | null) => {
        if (!cancelled) setAudioSrc(body?.url ?? null);
      })
      .catch(() => {
        if (!cancelled) setAudioSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [target, hasAudio, audioSrc, map.id]);

  const claim = useMemo(() => {
    if (!target) return null;
    const node = map.nodes[target.nodeId];
    if (!node) return null;
    return node;
  }, [target, map]);

  if (!target || !claim) return null;

  const snippets = [...(claim.snippets ?? [])].sort((a, b) => a.rank - b.rank);

  return (
    <>
      {/* Click-catching backdrop — closes on outside click without blocking the
          page visually. */}
      <div
        className="fixed inset-0 z-[300]"
        aria-hidden
        onClick={close}
      />
      <aside
        aria-label="Related transcript snippets"
        className="fixed right-0 top-0 z-[310] flex h-full max-w-[92vw] flex-col"
        style={{
          width,
          animation: exiting
            ? `snippet-drawer-out ${DRAWER_ANIM_MS}ms ease-in forwards`
            : `snippet-drawer-in ${DRAWER_ANIM_MS}ms ease-out`,
        }}
      >
        {/* Drag handle along the left edge to resize the drawer. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize snippet drawer"
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          className="absolute left-0 top-0 z-10 h-full w-2 -translate-x-1/2 cursor-col-resize"
        />

        {/* Close button — matches the style and margins of Back / FitView. */}
        <button
          type="button"
          onClick={close}
          aria-label="Close snippets"
          className="absolute z-10 flex items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-gray-50"
          style={{ top: 28, right: 28, width: 48, height: 48, border: "1px solid #EEEEEE" }}
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        <div
          className="flex h-full flex-col gap-7 overflow-y-auto px-7 pb-7"
          style={{ paddingTop: 96 }}
        >
          {snippets.length === 0 ? (
            <p className="font-mono text-[12px] leading-[1.6] text-dia-fg-dim">
              No snippets generated yet. Run the audio-snippet pipeline for this
              map from the admin panel.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {snippets.map((s, i) => {
                const p = SNIPPET_PALETTES[i % SNIPPET_PALETTES.length];
                return (
                  <li
                    key={i}
                    className="border p-3"
                    style={{
                      backgroundColor: p.bg,
                      borderColor: "#000",
                      color: p.fg,
                      fontFamily: "Georgia, serif",
                    }}
                  >
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span
                        className="truncate text-[12px]"
                        style={{ color: p.fg, opacity: 0.75, fontFamily: "var(--font-dm-sans), sans-serif", textTransform: "capitalize" }}
                      >
                        {s.speakerName}
                      </span>
                      <span
                        className="shrink-0 tabular-nums text-[12px]"
                        style={{ color: p.fg, opacity: 0.75, fontFamily: "var(--font-dm-sans), sans-serif" }}
                      >
                        {clock(s.startMs)}
                      </span>
                    </div>
                    <p
                      className="text-[16px] leading-[1.5]"
                      style={{ color: p.fg, fontFamily: "Georgia, serif" }}
                    >
                      &ldquo;{s.text}&rdquo;
                    </p>
                    <div className="mt-3">
                      {hasAudio && audioSrc === undefined ? (
                        <p
                          className="font-mono text-[10px] uppercase tracking-[1px]"
                          style={{ color: p.fg, opacity: 0.75 }}
                        >
                          loading audio…
                        </p>
                      ) : (
                        <SnippetAudioPlayer
                          src={hasAudio ? audioSrc ?? null : null}
                          startMs={s.startMs}
                          endMs={s.endMs}
                          tint={p.fg}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
