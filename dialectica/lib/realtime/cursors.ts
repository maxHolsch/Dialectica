"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Ephemeral per-map cursor channel. Uses Supabase Realtime broadcast (not
// presence, not postgres_changes) so positions are pub/sub-only — no DB rows,
// no fan-out via the annotations channel. Coordinates are sent in flow-space
// so they survive remote pan/zoom; the layer converts back to screen pixels.

export type RemoteCursor = {
  userId: string;
  displayName: string;
  color: string;
  x: number;
  y: number;
  lastSeen: number;
};

export type CursorIdentity = {
  userId: string;
  displayName: string;
  color: string;
};

type CursorPayload = {
  userId: string;
  displayName: string;
  color: string;
  x: number;
  y: number;
};

// Broadcast cadence. 40ms ≈ 25Hz — visibly smooth without burning realtime
// quota. Stale entries are pruned 5s after their last tick (covers tab-close,
// browser crash, or any case the leave event doesn't reach peers).
const SEND_INTERVAL_MS = 40;
const STALE_MS = 5_000;

export function useCursorChannel(mapId: string, me: CursorIdentity) {
  const { userId: myId, displayName: myName, color: myColor } = me;
  const [cursors, setCursors] = useState<Record<string, RemoteCursor>>({});

  const skipAuth = process.env.NEXT_PUBLIC_SKIP_AUTH === "true";

  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const lastSentRef = useRef(0);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const trailingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (skipAuth) return;
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const token = data.session?.access_token;
      if (token) supabase.realtime.setAuth(token);

      channel = supabase.channel(`dialectica:cursors:${mapId}`, {
        config: { broadcast: { self: false } },
      });

      channel
        .on("broadcast", { event: "cursor" }, ({ payload }) => {
          const p = payload as CursorPayload | undefined;
          if (!p || p.userId === myId) return;
          setCursors((prev) => ({
            ...prev,
            [p.userId]: {
              userId: p.userId,
              displayName: p.displayName,
              color: p.color,
              x: p.x,
              y: p.y,
              lastSeen: Date.now(),
            },
          }));
        })
        .on("broadcast", { event: "leave" }, ({ payload }) => {
          const p = payload as { userId?: string } | undefined;
          if (!p?.userId) return;
          setCursors((prev) => {
            if (!(p.userId! in prev)) return prev;
            const next = { ...prev };
            delete next[p.userId!];
            return next;
          });
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") subscribedRef.current = true;
        });

      channelRef.current = channel;
    });

    const { data: authSub } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    });

    const sweep = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => {
        let changed = false;
        const next: Record<string, RemoteCursor> = {};
        for (const [id, c] of Object.entries(prev)) {
          if (now - c.lastSeen < STALE_MS) next[id] = c;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1_000);

    return () => {
      cancelled = true;
      clearInterval(sweep);
      authSub.subscription.unsubscribe();
      if (trailingTimeoutRef.current) {
        clearTimeout(trailingTimeoutRef.current);
        trailingTimeoutRef.current = null;
      }
      if (channel) {
        void channel.send({
          type: "broadcast",
          event: "leave",
          payload: { userId: myId },
        });
        supabase.removeChannel(channel);
      }
      channelRef.current = null;
      subscribedRef.current = false;
    };
  }, [mapId, myId]);

  const broadcast = useCallback(
    (x: number, y: number) => {
      if (skipAuth) return;
      lastPosRef.current = { x, y };
      const now = Date.now();
      const elapsed = now - lastSentRef.current;

      const send = () => {
        const pos = lastPosRef.current;
        trailingTimeoutRef.current = null;
        if (!pos || !channelRef.current || !subscribedRef.current) return;
        lastSentRef.current = Date.now();
        void channelRef.current.send({
          type: "broadcast",
          event: "cursor",
          payload: {
            userId: myId,
            displayName: myName,
            color: myColor,
            x: pos.x,
            y: pos.y,
          } satisfies CursorPayload,
        });
      };

      if (elapsed >= SEND_INTERVAL_MS) {
        send();
        return;
      }
      if (trailingTimeoutRef.current) return;
      trailingTimeoutRef.current = setTimeout(send, SEND_INTERVAL_MS - elapsed);
    },
    [skipAuth, myId, myName, myColor],
  );

  const signalLeave = useCallback(() => {
    if (skipAuth || !channelRef.current || !subscribedRef.current) return;
    void channelRef.current.send({
      type: "broadcast",
      event: "leave",
      payload: { userId: myId },
    });
  }, [skipAuth, myId]);

  return { cursors, broadcast, signalLeave };
}
