/**
 * Seed sample participants + stakes for the "Google Xi Workshops" map (seed-001).
 *
 * Run: pnpm db:seed:stakes
 *
 * Idempotent:
 *   - users are matched by email and only created if missing
 *   - stakes use the (map_id, frame_id, node_id, user_id) unique constraint
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (bypasses RLS, lets us call auth.admin.*).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SampleUser = {
  handle: string;
  email: string;
  display_name: string;
};

const SAMPLE_USERS: SampleUser[] = [
  { handle: "ada", email: "ada.lovelace@dialectica.test", display_name: "Ada Lovelace" },
  { handle: "linus", email: "linus.aaltonen@dialectica.test", display_name: "Linus Aaltonen" },
  { handle: "barbara", email: "barbara.okeke@dialectica.test", display_name: "Barbara Okeke" },
  { handle: "carmen", email: "carmen.delgado@dialectica.test", display_name: "Carmen Delgado" },
  { handle: "mei", email: "mei.tanaka@dialectica.test", display_name: "Mei Tanaka" },
  { handle: "yusuf", email: "yusuf.haddad@dialectica.test", display_name: "Yusuf Haddad" },
  { handle: "ravi", email: "ravi.subramanian@dialectica.test", display_name: "Ravi Subramanian" },
];

const MAP_ID = "seed-001";

// Stakes per (frame, node) → list of user handles. Distribution intentionally
// uneven so the UI shows a mix of low/medium/high stake counts.
const STAKES: Record<string, Record<string, string[]>> = {
  "frame-tool-risk": {
    "n-cognitive-overload": ["ada", "linus", "barbara", "mei"],
    "n-sycophants": ["ada", "carmen", "yusuf"],
    "n-agency-pushback": ["mei", "carmen"],
    "n-humans-tell-too": ["barbara", "yusuf", "ravi", "linus", "ada"],
  },
  "frame-friction": {
    "n-friction-deliberation": ["ada", "mei", "linus", "barbara", "carmen"],
    "n-friction-access": ["yusuf", "ravi"],
    "n-friction-q-irreversible": ["mei", "barbara", "ada"],
    "n-friction-q-reversible": ["ravi", "linus"],
  },
  "frame-jobs": {
    "n-jobs-bullshit": ["yusuf", "ada", "carmen"],
    "n-jobs-transition": ["linus", "mei"],
    "n-jobs-q-craft": ["barbara", "ravi", "ada", "linus"],
    "n-jobs-q-service": ["carmen", "mei", "yusuf"],
  },
  "frame-agency": {
    "n-agency-atrophy": ["mei", "yusuf", "linus"],
    "n-agency-judgment": ["ada", "carmen", "ravi"],
    "n-agency-q-leisure": ["barbara"],
    "n-agency-q-drift": ["ada", "linus", "mei", "yusuf"],
  },
};

async function ensureUser(
  supabase: SupabaseClient,
  existingByEmail: Map<string, string>,
  user: SampleUser,
): Promise<string> {
  const existingId = existingByEmail.get(user.email);
  let userId = existingId;

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      email_confirm: true,
      user_metadata: { display_name: user.display_name },
    });
    if (error || !data.user) {
      throw new Error(`createUser failed for ${user.email}: ${error?.message}`);
    }
    userId = data.user.id;
  }

  // The handle_new_user trigger fills public.users, but it falls back to the
  // local-part of the email if display_name isn't in user_metadata. Make sure
  // the display_name we want is what's persisted (and role stays 'view').
  const { error: upsertErr } = await supabase.from("Dialectica_users").upsert(
    { id: userId, email: user.email, display_name: user.display_name, role: "view" },
    { onConflict: "id" },
  );
  if (upsertErr) {
    throw new Error(`users upsert failed for ${user.email}: ${upsertErr.message}`);
  }

  return userId;
}

async function loadExistingAuthUsers(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const byEmail = new Map<string, string>();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    for (const u of data.users) {
      if (u.email) byEmail.set(u.email, u.id);
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return byEmail;
}

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

  // Confirm the target map exists — surfacing a clearer error than the FK violation.
  const { data: map, error: mapErr } = await supabase
    .from("Dialectica_maps")
    .select("id")
    .eq("id", MAP_ID)
    .maybeSingle();
  if (mapErr) throw new Error(`maps lookup failed: ${mapErr.message}`);
  if (!map) {
    throw new Error(
      `map ${MAP_ID} not found — run \`pnpm db:seed\` first to populate maps.`,
    );
  }

  const existingByEmail = await loadExistingAuthUsers(supabase);

  const userIdByHandle = new Map<string, string>();
  for (const u of SAMPLE_USERS) {
    const id = await ensureUser(supabase, existingByEmail, u);
    userIdByHandle.set(u.handle, id);
    console.log(`user ready: ${u.display_name} (${u.email}) → ${id}`);
  }

  // Build the full stake row set, then upsert with the unique constraint as
  // the conflict target so re-runs are no-ops.
  const rows: Array<{
    map_id: string;
    frame_id: string;
    node_id: string;
    user_id: string;
  }> = [];
  for (const [frameId, byNode] of Object.entries(STAKES)) {
    for (const [nodeId, handles] of Object.entries(byNode)) {
      for (const handle of handles) {
        const user_id = userIdByHandle.get(handle);
        if (!user_id) {
          throw new Error(`Unknown user handle "${handle}" in STAKES[${frameId}][${nodeId}]`);
        }
        rows.push({ map_id: MAP_ID, frame_id: frameId, node_id: nodeId, user_id });
      }
    }
  }

  const { error: stakeErr, count } = await supabase
    .from("Dialectica_stakes")
    .upsert(rows, {
      onConflict: "map_id,frame_id,node_id,user_id",
      ignoreDuplicates: true,
      count: "exact",
    });
  if (stakeErr) throw new Error(`stakes upsert failed: ${stakeErr.message}`);

  console.log(
    `seeded ${rows.length} stake rows across ${Object.keys(STAKES).length} frames` +
      (typeof count === "number" ? ` (${count} inserted, rest already present)` : ""),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
