"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  rowToAnnotation,
  type AnnotationRow,
} from "@/lib/data/annotations-row";
import type { Annotation } from "@/lib/schema";

// Phase 5 / DIA-ANNO-4 — Supabase Realtime channel per map.
//
// We subscribe to INSERT/UPDATE/DELETE on Dialectica_annotations filtered by
// map_id. The CanvasShell hands us callbacks that splice the change into its
// optimistic merge layer, so a remote stroke appears identically to a local
// one within ~200ms (PRD §9.3 target).
//
// Note: the DELETE payload only includes `id` (Postgres limits OLD record for
// privacy unless REPLICA IDENTITY FULL is set). That's fine — we key by id.

export type AnnotationChangeHandlers = {
  onUpsert: (a: Annotation) => void;
  onDelete: (id: string) => void;
};

// Returns an unsubscribe function. Pass it to the useEffect cleanup.
export function subscribeToAnnotations(
  mapId: string,
  handlers: AnnotationChangeHandlers,
): () => void {
  const supabase = createSupabaseBrowserClient();
  const channel = supabase
    .channel(`dialectica:annotations:${mapId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "Dialectica_annotations",
        filter: `map_id=eq.${mapId}`,
      },
      (payload) => {
        try {
          handlers.onUpsert(rowToAnnotation(payload.new as AnnotationRow));
        } catch (err) {
          console.error("[realtime] bad INSERT payload", err);
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "Dialectica_annotations",
        filter: `map_id=eq.${mapId}`,
      },
      (payload) => {
        try {
          handlers.onUpsert(rowToAnnotation(payload.new as AnnotationRow));
        } catch (err) {
          console.error("[realtime] bad UPDATE payload", err);
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "Dialectica_annotations",
        filter: `map_id=eq.${mapId}`,
      },
      (payload) => {
        const id = (payload.old as { id?: string } | null)?.id;
        if (id) handlers.onDelete(id);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
