/**
 * Apply ELK layered-down auto-format to a map via the dev API route.
 * Triggers revalidatePath so changes appear immediately without a server restart.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/layout-format.ts
 *   node --env-file=.env.local --import tsx scripts/layout-format.ts "Google Xi Test7"
 */

import { createClient } from "@supabase/supabase-js";

const TARGET_TITLE = process.argv[2] ?? "Google Xi Test7";
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from("Dialectica_maps")
    .select("id, title")
    .eq("title", TARGET_TITLE)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`Map not found: "${TARGET_TITLE}"`);
  console.log(`Found map ${data.id} — "${data.title}"`);
  console.log(`POSTing to ${BASE_URL}/api/internal/reformat…`);

  const res = await fetch(`${BASE_URL}/api/internal/reformat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mapId: data.id, strategy: "layered-down" }),
  });

  const body = await res.json();
  if (!res.ok) throw new Error(`API error ${res.status}: ${JSON.stringify(body)}`);
  console.log(`Done — layout saved and cache revalidated.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
