"use client";

import { useState, useTransition } from "react";
import { FlagBanner } from "@phosphor-icons/react";
import { clsx } from "clsx";
import { toggleStake } from "@/lib/data/mutations";
import type { FrameNodeStakes, Staker } from "@/lib/data/stakes-types";
import { useUIStore } from "@/lib/state/useUIStore";

// Max = 03.png, John = 01.png. Safe fake-staker headshots: 02.jpg, 04.png, 05.jpg.
// 02.jpg and 05.jpg use the .jpg extension so headshotSrc's hash (01–04.png) can
// never auto-generate them for a real user — zero collision risk.
const HEADSHOT: Record<string, string> = {
  "fake-ada":     "/headshots/02.jpg",
  "fake-barbara": "/headshots/04.png",
  "fake-mei":     "/headshots/05.jpg",
};

function headshotSrc(id: string): string {
  if (HEADSHOT[id]) return HEADSHOT[id];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return `/headshots/0${(h % 4) + 1}.png`;
}

export function InlineAgreeBar({
  mapId,
  frameId,
  nodeId,
  stakes,
  userId,
  displayName,
  tilePale,
  tileDeep,
}: {
  mapId: string;
  frameId: string;
  nodeId: string;
  stakes: FrameNodeStakes | undefined;
  userId: string;
  displayName: string;
  tilePale?: string;
  tileDeep?: string;
}) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  const [localStaker, setLocalStaker] = useState<Staker | null>(null);
  const agreed = optimistic ?? (stakes?.selfStaked ?? false);
  const openSidePanel = useUIStore((s) => s.openSidePanel);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Select this tile so the agree bar stays visible even if hover has drifted,
    // which ensures the user can always click a second time to undo.
    openSidePanel({ frameId, nodeId });
    const next = !agreed;
    setOptimistic(next);
    if (next) {
      setLocalStaker({ id: userId, displayName, email: "", createdAt: new Date().toISOString() });
    } else {
      setLocalStaker(null);
    }
    startTransition(async () => {
      try {
        const res = await toggleStake(mapId, frameId, nodeId);
        setOptimistic(res.staked);
        if (!res.staked) setLocalStaker(null);
      } catch {
        setOptimistic(!next);
        setLocalStaker(null);
      }
    });
  };

  const serverStakers = stakes?.stakers ?? [];
  // Real user always first — optimistic when toggling, sorted from server data on reload.
  const stakers: Staker[] = localStaker
    ? [localStaker, ...serverStakers.filter((s) => s.id !== userId)]
    : [...serverStakers].sort((a, b) => (a.id === userId ? -1 : b.id === userId ? 1 : 0));

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleToggle}
        disabled={pending}
        className={clsx(
          "flex items-center gap-2 rounded-full border px-4 py-2 text-[14px] transition-all duration-150",
          agreed ? "" : "border-[#DDDDDD] bg-white text-black hover:border-black/25",
        )}
        style={{
          fontFamily: "var(--font-dm-sans), sans-serif",
          ...(agreed
            ? { backgroundColor: tilePale ?? "#0D90D3", color: tileDeep ?? "#ffffff", borderColor: tileDeep ?? "#0D90D3" }
            : {}),
        }}
      >
        <FlagBanner size={14} weight={agreed ? "fill" : "regular"} />
        {agreed ? "Agreed" : "Agree"}
      </button>

      {stakers.length > 0 && (
        <div className="flex items-center">
          {stakers.slice(0, 6).map((s, i) => (
            <StakerAvatar key={s.id} staker={s} index={i} total={Math.min(stakers.length, 6)} />
          ))}
        </div>
      )}
    </div>
  );
}

function StakerAvatar({ staker, index, total }: { staker: Staker; index: number; total: number }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative"
      style={{ marginLeft: index === 0 ? 0 : -8, zIndex: hovered ? 20 : total - index }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        src={headshotSrc(staker.id)}
        alt={staker.displayName}
        className="rounded-full select-none object-cover transition-transform duration-150"
        style={{
          width: 32,
          height: 32,
          transform: hovered ? "scale(1.18)" : "scale(1)",
          border: "2px solid #131313",
        }}
      />
      {hovered && (
        <div
          className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black px-3 py-1 text-white"
          style={{ fontSize: 12, lineHeight: "18px", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}
        >
          {staker.displayName}
        </div>
      )}
    </div>
  );
}
