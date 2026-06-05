import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  type FrameNodeStakes,
  type StakeMap,
  type Staker,
  stakeKey,
} from "./stakes-types";

// PRD §10.1 — claim stakes. One row per (map, frame, node, user).
// Attribution visibility (PRD §6.6): we always return staker rows here; the
// component decides whether to render names/emails based on currentMode().

export type { FrameNodeStakes, StakeMap, Staker };
export { stakeKey };

type StakeRow = {
  id: string;
  created_at: string;
  user_id: string;
  frame_id: string;
  node_id: string;
  users: {
    id: string;
    email: string;
    display_name: string;
  } | null;
};

export async function listStakesForMap(mapId: string): Promise<StakeMap> {
  if (process.env.SKIP_AUTH === "true") {
    const { devStakeMap } = await import("./dev-stake-store");
    const out: StakeMap = {};
    for (const [key, bucket] of devStakeMap.entries()) out[key] = bucket;
    return out;
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("Dialectica_stakes")
    .select(
      "id, created_at, user_id, frame_id, node_id, users:Dialectica_users(id, email, display_name)",
    )
    .eq("map_id", mapId)
    .order("created_at", { ascending: true });

  if (error) return {};

  const out: StakeMap = {};
  for (const raw of data ?? []) {
    const row = raw as unknown as StakeRow;
    const key = stakeKey(row.frame_id, row.node_id);
    const bucket =
      out[key] ??
      ({ count: 0, stakers: [], selfStaked: false } as FrameNodeStakes);
    bucket.count += 1;
    if (row.users) {
      bucket.stakers.push({
        id: row.users.id,
        displayName: row.users.display_name,
        email: row.users.email,
        createdAt: row.created_at,
      });
    }
    if (user && row.user_id === user.id) bucket.selfStaked = true;
    out[key] = bucket;
  }
  return out;
}
