/**
 * Apply ELK auto-format to a map and save directly to Supabase.
 * Uses the service-role client to bypass RLS (no user session in script context).
 * Run with: node --env-file=.env.local --import tsx scripts/layout-format.ts ["Map Title"]
 *
 * After running, do a hard-refresh in the browser (or restart the dev server)
 * to see the updated layout — Next.js's cache doesn't auto-clear from scripts.
 */

import { createClient } from "@supabase/supabase-js";
import { ArgMap } from "../lib/schema/index";
import { autoFormatArgMap } from "../lib/layout/autoFormatArgMap";

const TARGET_TITLE = process.argv[2] ?? "Google Xi Test7";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data, error } = await supabase
    .from("Dialectica_maps")
    .select("id, title, data")
    .eq("title", TARGET_TITLE)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`Map not found: "${TARGET_TITLE}"`);
  console.log(`Found map ${data.id} — "${data.title}"`);

  const map = ArgMap.parse(data.data);
  console.log("Running auto-format…");
  const formatted = await autoFormatArgMap(map, "layered-down", (msg) =>
    console.log(`  ${msg}`),
  );

  const next = ArgMap.parse({ ...formatted, updatedAt: new Date().toISOString() });
  const { error: updateError } = await supabase
    .from("Dialectica_maps")
    .update({ data: next, updated_at: next.updatedAt })
    .eq("id", data.id);

  if (updateError) throw updateError;
  console.log(`Done — saved ${data.id}. Hard-refresh the browser to see changes.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
