"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Phase 5 — Supabase Realtime Presence. One channel per "room"
// (typically a map). Each client tracks itself with `userId` as the
// presence key so multiple tabs from the same user collapse to a single
// entry, then derives `count` from `presenceState()` keys.

export type PresenceUser = {
  userId: string;
  displayName: string;
};

type PresenceMeta = PresenceUser & { online_at: string };

export function usePresence(
  channelKey: string,
  user: PresenceUser,
): { count: number; users: PresenceUser[] } {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const token = data.session?.access_token;
      if (token) supabase.realtime.setAuth(token);

      channel = supabase.channel(`dialectica:presence:${channelKey}`, {
        config: { presence: { key: user.userId } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          if (!channel) return;
          const state = channel.presenceState<PresenceMeta>();
          const list: PresenceUser[] = Object.values(state).flatMap((metas) => {
            const m = metas[0];
            return m ? [{ userId: m.userId, displayName: m.displayName }] : [];
          });
          setUsers(list);
        })
        .subscribe(async (status) => {
          if (status !== "SUBSCRIBED" || !channel) return;
          await channel.track({
            userId: user.userId,
            displayName: user.displayName,
            online_at: new Date().toISOString(),
          } satisfies PresenceMeta);
        });
    });

    const { data: authSub } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (channel) {
        void channel.untrack();
        supabase.removeChannel(channel);
      }
    };
  }, [channelKey, user.userId, user.displayName]);

  return { count: users.length, users };
}
