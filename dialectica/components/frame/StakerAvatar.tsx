"use client";

import type { Staker } from "@/lib/data/stakes-types";

const PASTELS = [
  "#cdf4d3", // mint
  "#f4cdd8", // pink
  "#f4dccd", // peach
  "#cde8f4", // blue
  "#ddcdf4", // lavender
  "#f4f0cd", // butter
];

function hashIndex(id: string, mod: number) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

export function initialsFor(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function StakerAvatar({
  staker,
  size = 22,
}: {
  staker: Pick<Staker, "id" | "displayName">;
  size?: number;
}) {
  const bg = PASTELS[hashIndex(staker.id, PASTELS.length)];
  const fontSize = Math.max(8, Math.round(size * 0.42));
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: bg }}
      aria-hidden
    >
      <span
        className="font-mono font-bold leading-none"
        style={{ fontSize, color: "rgba(0,0,0,0.78)" }}
      >
        {initialsFor(staker.displayName)}
      </span>
    </div>
  );
}

/**
 * Figma 34:67..34:84 — compact pill row of overlapping avatar circles.
 * Shows up to `max` stakers, then "+N" for the remainder.
 */
export function StakerAvatarRow({
  stakers,
  max = 8,
  size = 28,
}: {
  stakers: Staker[];
  max?: number;
  size?: number;
}) {
  if (stakers.length === 0) return null;
  const shown = stakers.slice(0, max);
  const overflow = stakers.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((s, i) => (
        <div
          key={s.id}
          style={{ marginLeft: i === 0 ? 0 : -6 }}
          title={s.displayName}
        >
          <StakerAvatar staker={s} size={size} />
        </div>
      ))}
      {overflow > 0 && (
        <span className="ml-2 font-mono text-[10px] text-dia-fg-dim">
          +{overflow}
        </span>
      )}
    </div>
  );
}
