"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import { runAutoFormat } from "@/lib/data/mutations";
import {
  LAYOUT_STRATEGIES,
  DEFAULT_STRATEGY,
  type LayoutStrategyId,
} from "@/lib/layout/strategies";

// Admin run-detail action: re-run auto-format with any strategy without
// re-running the AI pipeline. Sits next to the "OPEN MAP →" button.
export function ReformatMapPicker({ mapId }: { mapId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<LayoutStrategyId>(DEFAULT_STRATEGY);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onPick = useCallback(
    async (strategy: LayoutStrategyId) => {
      setOpen(false);
      setBusy(true);
      setLast(strategy);
      try {
        await runAutoFormat(mapId, strategy);
        router.refresh();
      } catch (err) {
        console.error("[admin] reformat failed", err);
      } finally {
        setBusy(false);
      }
    },
    [mapId, router],
  );

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="flex items-center gap-1 rounded-full border border-dia-border-strong px-4 py-2 font-mono text-[12px] tracking-[0.4px] text-dia-fg-muted transition-colors hover:text-dia-fg disabled:opacity-50"
      >
        {busy ? "FORMATTING…" : "RE-FORMAT"}
        <ChevronDown className="size-3" strokeWidth={2} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 min-w-[260px] rounded-lg border border-dia-border-strong bg-dia-surface p-1 shadow-lg"
        >
          {Object.values(LAYOUT_STRATEGIES).map((s) => (
            <button
              key={s.id}
              role="menuitem"
              type="button"
              onClick={() => onPick(s.id)}
              className={clsx(
                "block w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-dia-surface-2",
                s.id === last ? "text-dia-mint" : "text-dia-fg-muted",
              )}
            >
              <div className="font-mono text-[11px] tracking-wide">
                {s.label}
                {s.id === last ? "  ·  last used" : ""}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-dia-fg-dim">
                {s.description}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
