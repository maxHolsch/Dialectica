import "server-only";
import { ArgMap, type MapSummary } from "@/lib/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Phase 2 — Supabase-backed data layer. Same exports as Phase 1; pages don't change.

export type MapVisibility = "public" | "private";
export type MapPreviewKind =
  | "circles-3"
  | "frame-rects"
  | "circles-2"
  | "circles-rects"
  | "circles-3-spread"
  | "empty";

export type MapCard = {
  id: string;
  title: string;
  visibility: MapVisibility;
  /** Pre-formatted edited label as it appears on the card. */
  editedLabel: string;
  previewKind: MapPreviewKind;
  collaborators: { initials: string; color: string }[];
};

// Per-card presentational metadata that isn't (yet) modelled in the DB.
// The DB owns title, visibility, updated_at; this table owns preview style + collaborators.
// Unknown ids fall back to a neutral default so newly-created maps still render.
const CARD_PRESENTATION: Record<
  string,
  Pick<MapCard, "previewKind" | "collaborators">
> = {
  "seed-001": {
    previewKind: "circles-3",
    collaborators: [
      { initials: "EM", color: "#cdf4d3" },
      { initials: "JS", color: "#ffc2ec" },
      { initials: "LR", color: "#c2e5ff" },
    ],
  },
  "map-debatex": {
    previewKind: "frame-rects",
    collaborators: [
      { initials: "MK", color: "#cdf4d3" },
      { initials: "AT", color: "#ffc2ec" },
    ],
  },
  "map-max-essays": {
    previewKind: "circles-2",
    collaborators: [
      { initials: "JS", color: "#cdf4d3" },
      { initials: "RG", color: "#ffc2ec" },
      { initials: "HC", color: "#c2e5ff" },
      { initials: "EM", color: "#dcccff" },
    ],
  },
  "map-manosphere": {
    previewKind: "circles-rects",
    collaborators: [{ initials: "EM", color: "#cdf4d3" }],
  },
  "map-academics": {
    previewKind: "circles-3-spread",
    collaborators: [
      { initials: "LR", color: "#cdf4d3" },
      { initials: "HC", color: "#ffc2ec" },
    ],
  },
  "map-untitled": {
    previewKind: "empty",
    collaborators: [{ initials: "EM", color: "#cdf4d3" }],
  },
};

function formatEditedLabel(updatedAt: string): string {
  const updated = new Date(updatedAt).getTime();
  if (Number.isNaN(updated)) return "Edited";
  const diff = Date.now() - updated;
  const hours = Math.floor(diff / 36e5);
  if (hours < 1) return "Edited just now";
  if (hours < 24) return `Edited ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  return new Date(updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

type MapRow = {
  id: string;
  title: string;
  visibility: MapVisibility;
  updated_at: string;
};

export async function listMaps(): Promise<MapSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("Dialectica_maps")
    .select("id, title, data, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    topQuestion: (row.data as { topQuestion?: string })?.topQuestion ?? "",
    updatedAt: row.updated_at,
  }));
}

export async function listMapCards(): Promise<MapCard[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("Dialectica_maps")
    .select("id, title, visibility, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: MapRow): MapCard => {
    const presentation = CARD_PRESENTATION[row.id] ?? {
      previewKind: "empty" as MapPreviewKind,
      collaborators: [],
    };
    return {
      id: row.id,
      title: row.title,
      visibility: row.visibility,
      editedLabel: formatEditedLabel(row.updated_at),
      previewKind: presentation.previewKind,
      collaborators: presentation.collaborators,
    };
  });
}

export async function getMap(id: string): Promise<ArgMap | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("Dialectica_maps")
    .select("data")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return ArgMap.parse(data.data);
}
