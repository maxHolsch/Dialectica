"use client";

import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { Check } from "lucide-react";
import { toggleStake } from "@/lib/data/mutations";

/**
 * PRD §10.1 — "I stand behind this." Toggle button with optimistic state.
 * Reusable inside SidePanel and inside the right-click ContextMenu.
 */
export function StakeButton({
  mapId,
  frameId,
  nodeId,
  selfStaked,
  variant = "panel",
  onToggled,
}: {
  mapId: string;
  frameId: string;
  nodeId: string;
  selfStaked: boolean;
  variant?: "panel" | "menu";
  onToggled?: (next: boolean) => void;
}) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  const value = optimistic ?? selfStaked;

  const onClick = () => {
    const next = !value;
    setOptimistic(next);
    startTransition(async () => {
      try {
        const res = await toggleStake(mapId, frameId, nodeId);
        setOptimistic(res.staked);
        onToggled?.(res.staked);
      } catch (err) {
        console.error("[stake] toggle failed", err);
        setOptimistic(!next);
      }
    });
  };

  if (variant === "menu") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={clsx(
          "flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[12px] transition-colors",
          "hover:bg-dia-surface-2",
          value ? "text-[#ffc943]" : "text-dia-fg",
        )}
      >
        {value ? (
          <>
            <Check className="size-3.5" strokeWidth={2} />
            <span>You stand behind this</span>
          </>
        ) : (
          <span>I stand behind this</span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={value}
      className={clsx(
        "flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 font-mono text-[12px] uppercase tracking-wide transition-colors",
        value
          ? "border-[#ffc943] bg-[#ffc943]/10 text-[#ffc943] hover:bg-[#ffc943]/15"
          : "border-dia-border-strong bg-transparent text-dia-fg hover:bg-dia-surface-2",
        pending && "opacity-60",
      )}
    >
      {value ? (
        <>
          <Check className="size-4" strokeWidth={2} />
          You stand behind this
        </>
      ) : (
        <>I stand behind this</>
      )}
    </button>
  );
}
