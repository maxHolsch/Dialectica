"use client";

import { useState } from "react";
import type { Staker } from "@/lib/data/stakes-types";
import { StakerAvatar } from "./StakerAvatar";

/**
 * Figma 34:85..34:128 — staker rows with avatar + name + relative timestamp.
 *
 * Hovering a name reveals the user's email in a tooltip (both modes).
 */
export function StakerList({
  stakers,
}: {
  stakers: Staker[];
  // Kept for call-site compatibility; visibility no longer branches on mode.
  isEditMode?: boolean;
}) {
  if (stakers.length === 0) {
    return (
      <p className="font-mono text-[11px] text-dia-fg-dim">
        No one has staked yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {stakers.map((s, idx) => (
        <StakerRow key={s.id} staker={s} showDivider={idx > 0} />
      ))}
    </ul>
  );
}

function StakerRow({
  staker,
  showDivider,
}: {
  staker: Staker;
  showDivider: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <li
      className={
        "relative flex items-center gap-3 py-2 " +
        (showDivider ? "border-t border-[#141414]" : "")
      }
    >
      <StakerAvatar staker={staker} size={22} />
      <span
        className="min-w-0 flex-1 truncate font-mono text-[12px] text-dia-fg-muted"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {staker.displayName}
      </span>
      <span className="font-mono text-[10px] tabular-nums text-dia-fg-dim">
        {formatRelativeShort(staker.createdAt)}
      </span>
      {hover && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-[44px] top-full z-20 mt-1 whitespace-nowrap rounded border border-dia-border bg-[#111] px-2 py-1 font-mono text-[10px] text-dia-fg-muted shadow-lg"
        >
          {staker.email}
        </span>
      )}
    </li>
  );
}

function formatRelativeShort(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}
