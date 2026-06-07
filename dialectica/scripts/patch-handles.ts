/**
 * One-shot: rewrite all stored sourceHandle/targetHandle values in Test7 to
 * use slot 0 (the only slot now that SLOTS_PER_SIDE = 1). Replaces any
 * `src-{side}-N` or `tgt-{side}-N` with `src-{side}-0` / `tgt-{side}-0`.
 * No ELK needed — pure string replacement.
 *
 * Usage: node --env-file=.env.local --import tsx scripts/patch-handles.ts
 */

import { createClient } from "@supabase/supabase-js";

const MAP_ID = "map-gen-nyiz0g-mpzuxlzq";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function patchHandle(h: string | undefined): string | undefined {
  if (!h) return h;
  return h.replace(/^(src|tgt)-(top|bottom|left|right)-\d+$/, "$1-$2-0");
}

async function main() {
  const { data, error } = await supabase
    .from("Dialectica_maps")
    .select("data")
    .eq("id", MAP_ID)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Map not found");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = data.data as any;
  let patched = 0;

  for (const frame of Object.values(map.frames ?? {}) as any[]) {
    for (const edge of frame.edges ?? []) {
      const sh = patchHandle(edge.sourceHandle);
      const th = patchHandle(edge.targetHandle);
      if (sh !== edge.sourceHandle || th !== edge.targetHandle) {
        edge.sourceHandle = sh;
        edge.targetHandle = th;
        patched++;
      }
    }
  }
  for (const edge of map.cruxEdges ?? []) {
    const sh = patchHandle(edge.sourceHandle);
    const th = patchHandle(edge.targetHandle);
    if (sh !== edge.sourceHandle || th !== edge.targetHandle) {
      edge.sourceHandle = sh;
      edge.targetHandle = th;
      patched++;
    }
  }

  console.log(`Patched ${patched} handles.`);

  const { error: updateError } = await supabase
    .from("Dialectica_maps")
    .update({ data: map })
    .eq("id", MAP_ID);

  if (updateError) throw updateError;
  console.log("Done — hard-refresh the browser to see changes.");
}

main().catch((err) => { console.error(err); process.exit(1); });
