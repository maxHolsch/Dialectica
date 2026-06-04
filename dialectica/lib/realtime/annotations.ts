"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  rowToAnnotation,
  type AnnotationRow,
} from "@/lib/data/annotations-row";
import type { Annotation } from "@/lib/schema";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Phase 5 / DIA-ANNO-4 — Supabase Realtime channel per map.

export type AnnotationChangeHandlers = {
  onUpsert: (a: Annotation) => void;
  onDelete: (id: string) => void;
};

export function subscribeToAnnotations(
  mapId: string,
  handlers: AnnotationChangeHandlers,
): () => void {
  if (process.env.NEXT_PUBLIC_SKIP_AUTH === "true") return () => {};
  const supabase = createSupabaseBrowserClient();
  let cancelled = false;
  let channel: RealtimeChannel | null = null;

  // Attach JWT before opening the channel — postgres_changes RLS is evaluated
  // against the WebSocket's auth token, and creating the channel before
  // setAuth means events arrive at an anon connection.
  void supabase.auth.getSession().then(({ data }) => {
    if (cancelled) return;
    const token = data.session?.access_token;
    console.log("[realtime] session present:", Boolean(token));
    if (token) supabase.realtime.setAuth(token);

    channel = supabase
      .channel(`dialectica:annotations:${mapId}`)
      // No server-side filter — Supabase realtime's filter expression has
      // edge cases with hyphenated text values. We get one row per change
      // for this table (tiny payload) and filter map_id client-side.
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Dialectica_annotations",
        },
        (payload) => {
          const eventType = payload.eventType;
          if (eventType === "DELETE") {
            const id = (payload.old as { id?: string } | null)?.id;
            if (id) handlers.onDelete(id);
            return;
          }
          const row = payload.new as AnnotationRow;
          if (row.map_id !== mapId) return;
          try {
            const annotation = rowToAnnotation(row);
            console.log(`[realtime] ${eventType} → onUpsert`, {
              id: annotation.id,
              userId: annotation.userId,
            });
            handlers.onUpsert(annotation);
          } catch (err) {
            console.error(`[realtime] bad ${eventType} payload`, err);
          }
        },
      )
      .subscribe((status, err) => {
        console.log(`[realtime] channel status for map ${mapId}:`, status);
        if (err) console.error(`[realtime] channel error for map ${mapId}:`, err);
      });
  });

  // Keep realtime auth fresh across token refreshes for long-lived tabs.
  const { data: authSub } = supabase.auth.onAuthStateChange((_, session) => {
    if (session?.access_token) supabase.realtime.setAuth(session.access_token);
  });

  return () => {
    cancelled = true;
    authSub.subscription.unsubscribe();
    if (channel) supabase.removeChannel(channel);
  };
}
