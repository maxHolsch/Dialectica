"use client";

import { useState, useTransition } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import { FlagPennant } from "@phosphor-icons/react";
import { clsx } from "clsx";
import { toggleStake } from "@/lib/data/mutations";
import type { FrameNodeStakes, Staker } from "@/lib/data/stakes-types";

// Deterministically pick headshot 01–04 for a given staker id.
function headshotSrc(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return `/headshots/0${(h % 4) + 1}.png`;
}

export function AgreeBar({
  mapId,
  frameId,
  nodeId,
  stakes,
  userId,
  displayName,
}: {
  mapId: string;
  frameId: string;
  nodeId: string;
  stakes: FrameNodeStakes | undefined;
  userId: string;
  displayName: string;
}) {
  const reactFlow = useReactFlow();
  useViewport(); // re-render on pan/zoom so position tracks the node

  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  // Optimistic local staker — shown immediately on agree, cleared on un-agree.
  const [localStaker, setLocalStaker] = useState<Staker | null>(null);
  const agreed = optimistic ?? (stakes?.selfStaked ?? false);

  const handleToggle = () => {
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

  const node = reactFlow.getNode(nodeId);
  if (!node) return null;

  // Measure the tile's actual rendered inner div (the white card).
  // The ReactFlow wrapper has a fixed height that may exceed the content,
  // so getBoundingClientRect() on the first child gives the true visual bottom.
  const tileEl = typeof document !== "undefined"
    ? document.querySelector<HTMLElement>(`.react-flow__node[data-id="${nodeId}"] > div`)
    : null;
  const tileRect = tileEl?.getBoundingClientRect() ?? null;
  if (!tileRect) return null;

  // Merge server stakers with optimistic local staker, deduplicating by id.
  const serverStakers = stakes?.stakers ?? [];
  const stakers: Staker[] = localStaker
    ? [...serverStakers.filter((s) => s.id !== userId), localStaker]
    : serverStakers;

  return (
    <div
      className="pointer-events-auto fixed z-[200] flex items-center gap-3"
      style={{ left: tileRect.left, top: tileRect.bottom + 16 }}
    >
      {/* Agree / Agreed button */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        className={clsx(
          "flex items-center gap-2 rounded-full border px-4 py-2 text-[14px] transition-all duration-150",
          agreed
            ? "border-[#0D90D3]/25 bg-[#0D90D3]/10 text-[#0D90D3]"
            : "border-[#DDDDDD] bg-white text-black hover:border-black/25",
        )}
        style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.08)", fontFamily: "var(--font-dm-sans), sans-serif" }}
      >
        <FlagPennant size={14} weight={agreed ? "fill" : "regular"} />
        {agreed ? "Agreed" : "Agree"}
      </button>

      {/* Staker avatars */}
      {stakers.length > 0 && (
        <div className="flex items-center">
          {stakers.slice(0, 6).map((s, i) => (
            <Avatar key={s.id} staker={s} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function Avatar({ staker, index }: { staker: Staker; index: number }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative"
      style={{ marginLeft: index === 0 ? 0 : -8, zIndex: hovered ? 20 : index + 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        src={headshotSrc(staker.id)}
        alt={staker.displayName}
        className="rounded-full border-2 border-white select-none object-cover transition-transform duration-150"
        style={{
          width: 32,
          height: 32,
          transform: hovered ? "scale(1.18)" : "scale(1)",
        }}
      />
      {hovered && (
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/80 px-2 py-1 text-[11px] text-white">
          {staker.displayName}
        </div>
      )}
    </div>
  );
}
