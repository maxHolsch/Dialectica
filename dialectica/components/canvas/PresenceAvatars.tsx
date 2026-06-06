"use client";

import { useState } from "react";
import { usePresence } from "@/lib/realtime/presence";
import type { PresenceUser } from "@/lib/realtime/presence";

const HEADSHOT: Record<string, string> = {
  "dev-max": "/headshots/02.png",
};

function headshotSrc(id: string): string {
  if (HEADSHOT[id]) return HEADSHOT[id];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return `/headshots/0${(h % 4) + 1}.png`;
}

export function PresenceAvatars({
  mapId,
  userId,
  displayName,
}: {
  mapId: string;
  userId: string;
  displayName: string;
}) {
  const { users } = usePresence(mapId, { userId, displayName });

  // Always show the current user immediately (don't wait for presence sync).
  // Other users appear as the realtime channel syncs.
  const others = users.filter((u) => u.userId !== userId);
  const all: PresenceUser[] = [{ userId, displayName }, ...others];

  return (
    <div className="pointer-events-none fixed right-8 top-8 z-[200] flex items-center">
      {all.map((u, i) => (
        <Pip key={u.userId} user={u} index={i} total={all.length} isCurrentUser={u.userId === userId} />
      ))}
    </div>
  );
}

function Pip({
  user,
  index,
  total,
  isCurrentUser,
}: {
  user: PresenceUser;
  index: number;
  total: number;
  isCurrentUser: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="pointer-events-auto relative"
      style={{
        marginLeft: index === 0 ? 0 : -8,
        zIndex: hovered ? total + 1 : total - index,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        src={headshotSrc(user.userId)}
        alt={user.displayName}
        className="block select-none rounded-full border-2 border-white object-cover"
        style={{ width: 48, height: 48 }}
      />
      {hovered && (
        <div
          className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black px-3 py-1 text-white"
          style={{
            fontSize: 12,
            lineHeight: "18px",
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          }}
        >
          {user.displayName}{isCurrentUser ? " (You)" : ""}
        </div>
      )}
    </div>
  );
}
