"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ArgMap,
  type ArgMap as ArgMapT,
  type Annotation as AnnotationT,
  type HandleId,
} from "@/lib/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/data/users";
import { upsertAnnotationRow, deleteAnnotationRow } from "@/lib/data/annotations";
import { autoFormatArgMap } from "@/lib/layout/autoFormatArgMap";
import {
  resolveStrategy,
  type LayoutStrategyId,
} from "@/lib/layout/strategies";
import { getMap } from "@/lib/data/maps";

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

// Move-mode persistence (DIA-EDIT-MOVE). One server action writes an
// arbitrary subset of position/edge updates into the map JSON so the canvas
// can flush several changes from a single drag without round-tripping
// every property individually.
export type MoveMapPatch = {
  topQuestionPosition?: { x: number; y: number };
  /** cruxId -> new position */
  cruxPositions?: Record<string, { x: number; y: number }>;
  /** edgeId -> updates to the crux-level edge */
  cruxEdges?: Record<
    string,
    {
      source?: string;
      target?: string;
      labelOffset?: number;
      sourceHandle?: HandleId | null;
      targetHandle?: HandleId | null;
    }
  >;
  /** frameId -> nodeId -> new position */
  framePositions?: Record<string, Record<string, { x: number; y: number }>>;
  /** frameId -> edgeId -> updates */
  frameEdges?: Record<
    string,
    Record<
      string,
      {
        source?: string;
        target?: string;
        labelOffset?: number;
        sourceHandle?: HandleId | null;
        targetHandle?: HandleId | null;
      }
    >
  >;
};

export async function applyMovePatch(mapId: string, patch: MoveMapPatch) {
  const user = await currentUser();
  if (!user || user.role !== "edit") {
    throw new Error("Only edit-role users can move nodes.");
  }
  const supabase = await createSupabaseServerClient();
  const { data: row, error: readErr } = await supabase
    .from("Dialectica_maps")
    .select("data")
    .eq("id", mapId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!row) throw new Error(`Map ${mapId} not found`);

  const map = ArgMap.parse(row.data);

  if (patch.topQuestionPosition) {
    map.topQuestionPosition = patch.topQuestionPosition;
  }
  if (patch.cruxPositions) {
    for (const c of map.cruxes) {
      const p = patch.cruxPositions[c.id];
      if (p) c.position = p;
    }
  }
  if (patch.cruxEdges) {
    for (const e of map.cruxEdges) {
      const upd = patch.cruxEdges[e.id];
      if (!upd) continue;
      if (upd.source !== undefined) e.source = upd.source;
      if (upd.target !== undefined) e.target = upd.target;
      if (upd.labelOffset !== undefined) e.labelOffset = upd.labelOffset;
      if (upd.sourceHandle !== undefined) {
        e.sourceHandle = upd.sourceHandle ?? undefined;
      }
      if (upd.targetHandle !== undefined) {
        e.targetHandle = upd.targetHandle ?? undefined;
      }
    }
  }
  if (patch.framePositions) {
    for (const [frameId, byNode] of Object.entries(patch.framePositions)) {
      const frame = map.frames[frameId];
      if (!frame) continue;
      for (const inst of frame.nodeInstances) {
        const p = byNode[inst.nodeId];
        if (p) inst.position = p;
      }
    }
  }
  if (patch.frameEdges) {
    for (const [frameId, byEdge] of Object.entries(patch.frameEdges)) {
      const frame = map.frames[frameId];
      if (!frame) continue;
      for (const e of frame.edges) {
        const upd = byEdge[e.id];
        if (!upd) continue;
        if (upd.source !== undefined) e.source = upd.source;
        if (upd.target !== undefined) e.target = upd.target;
        if (upd.labelOffset !== undefined) e.labelOffset = upd.labelOffset;
        if (upd.sourceHandle !== undefined) {
          e.sourceHandle = upd.sourceHandle ?? undefined;
        }
        if (upd.targetHandle !== undefined) {
          e.targetHandle = upd.targetHandle ?? undefined;
        }
      }
    }
  }

  map.updatedAt = new Date().toISOString();

  const { error } = await supabase
    .from("Dialectica_maps")
    .update({ data: map, updated_at: map.updatedAt })
    .eq("id", mapId);
  if (error) throw new Error(error.message);
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

// Phase 8 (auto-format) — replace the full ArgMap JSONB after layout, then
// revalidate the crux and frame pages so React Server Component caches
// re-fetch. Validates with ArgMap.parse() before writing so a buggy layout
// pass can never poison the DB with an off-shape blob.
export async function updateMapLayout(
  mapId: string,
  argMap: ArgMapT,
): Promise<void> {
  const user = await currentUser();
  if (!user || user.role !== "edit") {
    throw new Error("Only edit-role users can update map layout.");
  }
  const next = ArgMap.parse({
    ...argMap,
    updatedAt: new Date().toISOString(),
  });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("Dialectica_maps")
    .update({ data: next, updated_at: next.updatedAt })
    .eq("id", mapId);
  if (error) throw new Error(error.message);
}

// Phase 8 — fetch the current map, run auto-format, persist. Used by the
// edit-mode AUTO-FORMAT toolbar button.
export async function runAutoFormat(
  mapId: string,
  strategyRaw?: string,
): Promise<void> {
  const user = await currentUser();
  if (!user || user.role !== "edit") {
    throw new Error("Only edit-role users can auto-format a map.");
  }
  const strategy: LayoutStrategyId = resolveStrategy(strategyRaw);
  const map = await getMap(mapId);
  if (!map) throw new Error(`Map ${mapId} not found`);
  const next = await autoFormatArgMap(map, strategy);
  await updateMapLayout(mapId, next);
  revalidatePath(`/m/${mapId}/crux`);
  revalidatePath(`/m/${mapId}/frame/[frameId]`, "page");
}
