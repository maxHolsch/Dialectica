// Client-safe types for Phase 4 stakes. The server-only loader lives in
// `lib/data/stakes.ts` and depends on `lib/supabase/server` (and thus cookies),
// which Next refuses to bundle into a Client Component graph.

export type Staker = {
  id: string;
  displayName: string;
  email: string;
  createdAt: string;
};

export type FrameNodeStakes = {
  count: number;
  stakers: Staker[];
  selfStaked: boolean;
};

export type StakeMap = Record<string, FrameNodeStakes>;

export function stakeKey(frameId: string, nodeId: string) {
  return `${frameId}::${nodeId}`;
}
