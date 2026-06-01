"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ArgMap,
  type ArgMap as ArgMapT,
  type Annotation as AnnotationT,
} from "@/lib/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/data/users";
import { upsertAnnotationRow, deleteAnnotationRow } from "@/lib/data/annotations";

// PRD §6.6: maps write requires role = 'edit'. Annotations are writable by any
// signed-in user, but each user can only modify their own (RLS-enforced).

function slugId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function emptyMap(id: string, title: string): ArgMapT {
  const now = new Date().toISOString();
  return ArgMap.parse({
    id,
    title,
    topQuestion: "What is this map about?",
    topQuestionPosition: { x: 818, y: 81 },
    topQuestionSize: { width: 291, height: 265 },
    cruxes: [],
    cruxEdges: [],
    nodes: {},
    frames: {},
    annotations: [],
    createdAt: now,
    updatedAt: now,
  });
}

export async function createMap() {
  const user = await currentUser();
  if (!user || user.role !== "edit") {
    throw new Error("Only edit-role users can create maps.");
  }

  const id = slugId("map");
  const data = emptyMap(id, "Untitled map");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("Dialectica_maps").insert({
    id,
    title: "Untitled map",
    visibility: "private",
    owner_id: user.id,
    data,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/");
  redirect(`/m/${id}/crux`);
}

export async function renameMap(id: string, title: string) {
  const user = await currentUser();
  if (!user || user.role !== "edit") {
    throw new Error("Only edit-role users can rename maps.");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("Dialectica_maps")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/m/${id}/crux`);
}

export async function deleteMap(id: string) {
  const user = await currentUser();
  if (!user || user.role !== "edit") {
    throw new Error("Only edit-role users can delete maps.");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("Dialectica_maps").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

// Phase 5: annotations live in the dedicated `Dialectica_annotations` table.
// Inserts go via Supabase Realtime → other clients see strokes within ~200ms.
// Upsert semantics: a re-save of the same id (drag-move, undo→redo) replaces
// the prior row so the realtime UPDATE event keeps subscribers in sync.
export async function createAnnotation(
  mapId: string,
  annotation: AnnotationT,
) {
  const user = await currentUser();
  if (!user) throw new Error("Sign in required to annotate.");
  await upsertAnnotationRow(mapId, annotation, user.id);
  // No revalidatePath: realtime broadcasts the change to live subscribers, and
  // the next server fetch (e.g. fresh page load) will pull the row from
  // `Dialectica_annotations` directly.
}

// Phase 4 — claim stakes (DIA-CLAIM-1).
export async function toggleStake(
  mapId: string,
  frameId: string,
  nodeId: string,
): Promise<{ staked: boolean }> {
  const user = await currentUser();
  if (!user) throw new Error("Sign in required to stake a claim.");
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: readErr } = await supabase
    .from("Dialectica_stakes")
    .select("id")
    .eq("map_id", mapId)
    .eq("frame_id", frameId)
    .eq("node_id", nodeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);

  if (existing) {
    const { error } = await supabase
      .from("Dialectica_stakes")
      .delete()
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    revalidatePath(`/m/${mapId}/crux`);
    revalidatePath(`/m/${mapId}/frame/${frameId}`);
    return { staked: false };
  }

  const { error } = await supabase.from("Dialectica_stakes").insert({
    map_id: mapId,
    frame_id: frameId,
    node_id: nodeId,
    user_id: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/m/${mapId}/crux`);
  revalidatePath(`/m/${mapId}/frame/${frameId}`);
  return { staked: true };
}

export async function deleteAnnotation(mapId: string, annotationId: string) {
  const user = await currentUser();
  if (!user) throw new Error("Sign in required to remove annotations.");
  // RLS enforces the actual rule: own strokes for view users, any for edit users.
  // We pass user.role so the helper can short-circuit a forbidden delete with a
  // graceful no-op instead of a thrown RLS error (PRD §9.1).
  await deleteAnnotationRow(mapId, annotationId, {
    userId: user.id,
    isEditMode: user.role === "edit",
  });
}
