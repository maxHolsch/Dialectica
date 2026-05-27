/**
 * Seed all 6 homepage map cards into Supabase as real ArgMap rows.
 *
 * Prereq: `db/schema.sql` has been applied. .env.local has SUPABASE_SERVICE_ROLE_KEY.
 *
 * Run: pnpm dlx tsx db/seed.ts   (or: pnpm tsx db/seed.ts if you have tsx installed)
 *
 * The service-role key bypasses RLS, which is what we want for seeding.
 */

import { createClient } from "@supabase/supabase-js";
import { ArgMap } from "@/lib/schema";
import seed from "@/lib/fixtures/seed-map.json";
import { STUB_MAPS } from "@/lib/fixtures/stub-maps";

type CardMeta = {
  id: string;
  title: string;
  visibility: "public" | "private";
};

const CARD_META: CardMeta[] = [
  { id: "seed-001", title: "Google Xi Workshops", visibility: "public" },
  { id: "map-debatex", title: "DebateX Symposiums", visibility: "private" },
  { id: "map-max-essays", title: "Max's Essays", visibility: "public" },
  { id: "map-manosphere", title: "Online Discourse on the Manosphere", visibility: "private" },
  { id: "map-academics", title: "Academics Who Build Event #1", visibility: "private" },
  { id: "map-untitled", title: "Untitled map", visibility: "private" },
];

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

  const SEED_MAP: ArgMap = ArgMap.parse(seed);
  const FULL_MAPS: ArgMap[] = [SEED_MAP, ...STUB_MAPS];

  for (const card of CARD_META) {
    const map = FULL_MAPS.find((m) => m.id === card.id);
    if (!map) {
      console.warn(`No ArgMap found for ${card.id}, skipping`);
      continue;
    }
    ArgMap.parse(map);

    const { error } = await supabase.from("maps").upsert(
      {
        id: card.id,
        title: card.title,
        visibility: card.visibility,
        data: map,
        owner_id: null,
        created_at: map.createdAt,
        updated_at: map.updatedAt,
      },
      { onConflict: "id" },
    );

    if (error) {
      console.error(`Failed to seed ${card.id}:`, error.message);
      process.exitCode = 1;
    } else {
      console.log(`seeded ${card.id} (${card.title})`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
