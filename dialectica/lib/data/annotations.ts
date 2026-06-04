import "server-only";

import { Annotation, type Annotation as AnnotationT } from "@/lib/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  rowToAnnotation,
  type AnnotationRow,
} from "@/lib/data/annotations-row";

export { rowToAnnotation };
export type { AnnotationRow };

function annotationToRow(
  mapId: string,
  a: AnnotationT,
  authorId: string,
): Omit<AnnotationRow, "created_at"> & { created_at?: string } {
  return {
    id: a.id,
    map_id: mapId,
    frame_id: a.frameId ?? null,
    user_id: authorId,
    tool: a.tool,
    color: a.color,
    size: a.size,
    origin: a.origin,
    width: a.width,
    height: a.height,
    points: a.points,
    text: a.text ?? null,
    created_at: a.createdAt,
  };
}

// Read all annotations for a map. CanvasShell filters by frame on the client
// (frame view sees frameId === current; crux view sees frameId === null).
export async function listAnnotationsForMap(
  mapId: string,
): Promise<AnnotationT[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("Dialectica_annotations")
    .select(
      "id, map_id, frame_id, user_id, tool, color, size, origin, width, height, points, text, created_at",
    )
    .eq("map_id", mapId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToAnnotation(r as AnnotationRow));
}

// Upsert by id. Used for both new strokes and drag-move updates of an existing one.
// Update-then-insert preserves the original user_id when an edit-role user moves
// someone else's stroke.
export async function upsertAnnotationRow(
  mapId: string,
  annotation: AnnotationT,
  authorId: string,
): Promise<void> {
  const parsed = Annotation.parse(annotation);
  const supabase = await createSupabaseServerClient();

  const updatePayload = {
    frame_id: parsed.frameId ?? null,
    tool: parsed.tool,
    color: parsed.color,
    size: parsed.size,
    origin: parsed.origin,
    width: parsed.width,
    height: parsed.height,
    points: parsed.points,
    text: parsed.text ?? null,
  };
  const { data: updated, error: updateErr } = await supabase
    .from("Dialectica_annotations")
    .update(updatePayload)
    .eq("id", parsed.id)
    .eq("map_id", mapId)
    .select("id");
  if (updateErr) throw new Error(updateErr.message);
  if (updated && updated.length > 0) return;

  const row = annotationToRow(mapId, parsed, authorId);
  const { error: insertErr } = await supabase
    .from("Dialectica_annotations")
    .insert(row);
  // 23505 = unique_violation: concurrent request inserted the same id between
  // our UPDATE check and this INSERT. Fall back to UPDATE to resolve the race.
  if (insertErr?.code === "23505") {
    const { error: retryErr } = await supabase
      .from("Dialectica_annotations")
      .update(updatePayload)
      .eq("id", parsed.id)
      .eq("map_id", mapId);
    if (retryErr) throw new Error(retryErr.message);
    return;
  }
  if (insertErr) throw new Error(insertErr.message);
}

// Delete with graceful no-op when the caller can't delete (view user, not author).
// We pre-check on the server so RLS rejections don't surface as a thrown error
// — PRD §9.1 wants silent no-op.
export async function deleteAnnotationRow(
  mapId: string,
  annotationId: string,
  caller: { userId: string; isEditMode: boolean },
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: existing, error: readErr } = await supabase
    .from("Dialectica_annotations")
    .select("id, user_id")
    .eq("id", annotationId)
    .eq("map_id", mapId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) return;
  const isOwner = existing.user_id === caller.userId;
  if (!isOwner && !caller.isEditMode) return;

  const { error: deleteErr } = await supabase
    .from("Dialectica_annotations")
    .delete()
    .eq("id", annotationId)
    .eq("map_id", mapId);
  if (deleteErr) throw new Error(deleteErr.message);
}
