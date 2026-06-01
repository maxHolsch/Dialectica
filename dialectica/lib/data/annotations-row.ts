// Shared row shape + mapper for Dialectica_annotations.
// Lives outside annotations.ts so both server reads/writes and the client-side
// Realtime subscriber can import without pulling in `server-only` modules.

import { Annotation, type Annotation as AnnotationT } from "@/lib/schema";

export type AnnotationRow = {
  id: string;
  map_id: string;
  frame_id: string | null;
  user_id: string | null;
  tool: AnnotationT["tool"];
  color: string;
  size: number;
  origin: AnnotationT["origin"];
  width: number;
  height: number;
  points: AnnotationT["points"];
  text: string | null;
  created_at: string;
};

export function rowToAnnotation(row: AnnotationRow): AnnotationT {
  return Annotation.parse({
    id: row.id,
    frameId: row.frame_id ?? undefined,
    points: row.points,
    tool: row.tool,
    color: row.color,
    size: row.size,
    origin: row.origin,
    width: row.width,
    height: row.height,
    text: row.text ?? undefined,
    userId: row.user_id ?? "",
    createdAt: row.created_at,
  });
}
