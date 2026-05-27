"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ArgMap,
  Annotation,
  type ArgMap as ArgMapT,
  type Annotation as AnnotationT,
} from "@/lib/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/data/users";

// PRD §6.6: writes require role = 'edit'. The DB RLS enforces this; the
// server-action checks add a friendlier error and avoid wasted round-trips.

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

async function loadMapForWrite(id: string): Promise<ArgMapT> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("maps")
    .select("data")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Map ${id} not found`);
  return ArgMap.parse(data.data);
}

async function saveMap(id: string, next: ArgMapT) {
  const supabase = await createSupabaseServerClient();
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("maps")
    .update({ data: { ...next, updatedAt }, updated_at: updatedAt })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createMap() {
  const user = await currentUser();
  if (!user || user.role !== "edit") {
    throw new Error("Only edit-role users can create maps.");
  }

  const id = slugId("map");
  const data = emptyMap(id, "Untitled map");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("maps").insert({
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
    .from("maps")
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
  const { error } = await supabase.from("maps").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

// Phase 3 — annotations live inside maps.data JSONB. Phase 5 migrates them to
// a dedicated `annotations` table with realtime broadcast + per-user permissions.
export async function createAnnotation(
  mapId: string,
  annotation: AnnotationT,
) {
  const user = await currentUser();
  if (!user) throw new Error("Sign in required to annotate.");
  const parsed = Annotation.parse(annotation);
  const map = await loadMapForWrite(mapId);
  // Idempotent: replace any prior annotation with the same id (lets undo→redo restore).
  const next = {
    ...map,
    annotations: [
      ...map.annotations.filter((a) => a.id !== parsed.id),
      parsed,
    ],
  };
  await saveMap(mapId, next);
  revalidatePath(`/m/${mapId}/crux`);
  if (parsed.frameId) {
    revalidatePath(`/m/${mapId}/frame/${parsed.frameId}`);
  }
}

export async function deleteAnnotation(mapId: string, annotationId: string) {
  const user = await currentUser();
  if (!user) throw new Error("Sign in required to remove annotations.");
  const map = await loadMapForWrite(mapId);
  const target = map.annotations.find((a) => a.id === annotationId);
  if (!target) return; // no-op
  // Phase 5 will enforce: view users can only delete own strokes.
  const next = {
    ...map,
    annotations: map.annotations.filter((a) => a.id !== annotationId),
  };
  await saveMap(mapId, next);
  revalidatePath(`/m/${mapId}/crux`);
  if (target.frameId) {
    revalidatePath(`/m/${mapId}/frame/${target.frameId}`);
  }
}
