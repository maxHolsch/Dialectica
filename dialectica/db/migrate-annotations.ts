/**
 * Phase 5 migration — copy Phase 3 JSONB-backed annotations into the dedicated
 * Dialectica_annotations table, then strip them from each map's JSONB blob.
 *
 * Idempotent: re-running upserts by id and re-strips any leftover JSONB entries.
 *
 * Run: pnpm db:migrate:annotations
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (bypasses RLS so we can write rows whose
 * user_id refers to authors we may not be acting as).
 */

import { createClient } from "@supabase/supabase-js";

type LegacyAnnotation = {
  id: string;
  frameId?: string;
  points: Array<{ x: number; y: number; t: number; pressure?: number }>;
  tool: string;
  color: string;
  size: number;
  origin: { x: number; y: number };
  width: number;
  height: number;
  text?: string;
  userId: string;
  createdAt: string;
};

type MapRow = {
  id: string;
  data: {
    annotations?: LegacyAnnotation[];
    [k: string]: unknown;
  };
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false },
  });

  const { data: maps, error: readErr } = await supabase
    .from("Dialectica_maps")
    .select("id, data");
  if (readErr) throw new Error(`maps read failed: ${readErr.message}`);

  let totalInserted = 0;
  let totalMaps = 0;
  for (const rawRow of (maps ?? []) as MapRow[]) {
    const legacy = rawRow.data?.annotations;
    if (!Array.isArray(legacy) || legacy.length === 0) continue;

    totalMaps += 1;
    // user_id can be a non-UUID placeholder (e.g. "anon" from Phase 3 fixtures);
    // we drop those rather than corrupt the FK. The trade-off: Phase 3
    // pre-auth scribbles by "anon" don't carry over. PRD §9.1 wants attribution
    // anyway, and there shouldn't be many of these in practice.
    const isUuid = (s: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

    const rows = legacy
      .filter((a) => isUuid(a.userId))
      .map((a) => ({
        id: a.id,
        map_id: rawRow.id,
        frame_id: a.frameId ?? null,
        user_id: a.userId,
        tool: a.tool,
        color: a.color,
        size: a.size,
        origin: a.origin,
        width: a.width,
        height: a.height,
        points: a.points,
        text: a.text ?? null,
        created_at: a.createdAt,
      }));

    const dropped = legacy.length - rows.length;
    if (rows.length > 0) {
      const { error: upErr } = await supabase
        .from("Dialectica_annotations")
        .upsert(rows, { onConflict: "id" });
      if (upErr) {
        console.error(`upsert failed for map ${rawRow.id}: ${upErr.message}`);
        process.exitCode = 1;
        continue;
      }
      totalInserted += rows.length;
    }

    // Strip annotations from the JSONB blob now that they live in the table.
    const { annotations: _drop, ...rest } = rawRow.data;
    void _drop;
    const { error: stripErr } = await supabase
      .from("Dialectica_maps")
      .update({ data: { ...rest, annotations: [] } })
      .eq("id", rawRow.id);
    if (stripErr) {
      console.error(
        `failed to clear annotations from map ${rawRow.id}: ${stripErr.message}`,
      );
      process.exitCode = 1;
      continue;
    }

    console.log(
      `migrated ${rawRow.id}: ${rows.length} rows` +
        (dropped > 0 ? ` (skipped ${dropped} non-uuid authors)` : ""),
    );
  }

  console.log(
    `done: ${totalInserted} annotations across ${totalMaps} maps copied to Dialectica_annotations`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
