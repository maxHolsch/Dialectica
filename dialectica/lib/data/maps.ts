import { ArgMap, MapSummary } from "@/lib/schema";
import seed from "@/lib/fixtures/seed-map.json";

// Phase 1: a single full fixture map + extra summaries for homepage parity.
// Phase 2 replaces this module with a Supabase client; UI consumers don't change.

const SEED_MAP: ArgMap = ArgMap.parse(seed);
const FULL_MAPS: ArgMap[] = [SEED_MAP];

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

// Pre-built card metadata for the homepage grid. Order + copy match Figma node 2:5.
const HOMEPAGE_CARDS: MapCard[] = [
  {
    id: SEED_MAP.id,
    title: SEED_MAP.title,
    visibility: "public",
    editedLabel: "Edited 2h ago",
    previewKind: "circles-3",
    collaborators: [
      { initials: "EM", color: "#cdf4d3" },
      { initials: "JS", color: "#ffc2ec" },
      { initials: "LR", color: "#c2e5ff" },
    ],
  },
  {
    id: "map-debatex",
    title: "DebateX Symposiums",
    visibility: "private",
    editedLabel: "Yesterday",
    previewKind: "frame-rects",
    collaborators: [
      { initials: "MK", color: "#cdf4d3" },
      { initials: "AT", color: "#ffc2ec" },
    ],
  },
  {
    id: "map-max-essays",
    title: "Max's Essays",
    visibility: "public",
    editedLabel: "3 days ago",
    previewKind: "circles-2",
    collaborators: [
      { initials: "JS", color: "#cdf4d3" },
      { initials: "RG", color: "#ffc2ec" },
      { initials: "HC", color: "#c2e5ff" },
      { initials: "EM", color: "#dcccff" },
    ],
  },
  {
    id: "map-manosphere",
    title: "Online Discourse on the Manosphere",
    visibility: "private",
    editedLabel: "Apr 14",
    previewKind: "circles-rects",
    collaborators: [{ initials: "EM", color: "#cdf4d3" }],
  },
  {
    id: "map-academics",
    title: "Academics Who Build Event #1",
    visibility: "private",
    editedLabel: "Apr 11",
    previewKind: "circles-3-spread",
    collaborators: [
      { initials: "LR", color: "#cdf4d3" },
      { initials: "HC", color: "#ffc2ec" },
    ],
  },
  {
    id: "map-untitled",
    title: "Untitled map",
    visibility: "private",
    editedLabel: "Apr 9",
    previewKind: "empty",
    collaborators: [{ initials: "EM", color: "#cdf4d3" }],
  },
];

export async function listMaps(): Promise<MapSummary[]> {
  return HOMEPAGE_CARDS.map((c) => ({
    id: c.id,
    title: c.title,
    topQuestion: SEED_MAP.topQuestion,
    updatedAt: SEED_MAP.updatedAt,
  }));
}

export async function listMapCards(): Promise<MapCard[]> {
  return HOMEPAGE_CARDS;
}

export async function getMap(id: string): Promise<ArgMap | null> {
  // Demo fallback: cards with no backing full map resolve to the seed so click-through still works in Phase 1.
  return FULL_MAPS.find((m) => m.id === id) ?? SEED_MAP;
}
