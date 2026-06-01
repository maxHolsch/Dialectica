"use client";

import { cn } from "@/lib/utils";
import { usePresence } from "@/lib/realtime/presence";

export function LivePill({
  channelKey,
  userId,
  displayName,
}: {
  channelKey: string;
  userId: string;
  displayName: string;
}) {
  const { count } = usePresence(channelKey, { userId, displayName });
  const display = Math.max(count, 1);
  return (
    <span
      className={cn(
        "flex h-6 items-center gap-1.5 rounded-full px-3 font-mono text-[12px] tracking-[0.48px] text-dia-mint",
        "border border-[color:rgba(205,244,211,0.4)]",
      )}
    >
      <span
        aria-hidden
        className="inline-block size-1.5 rounded-full bg-dia-mint"
      />
      {display} live
    </span>
  );
}
