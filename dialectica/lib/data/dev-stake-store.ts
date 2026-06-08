// In-memory stake store for SKIP_AUTH=true dev mode.
// Shared between stakes.ts (read) and mutations.ts (write).
// Resets on server restart — never used in production.
import type { FrameNodeStakes, Staker } from "./stakes-types";

// 3 simulated participants. Max = 03.png, John = 01.png are reserved.
export const FAKE_STAKERS: Staker[] = [
  { id: "fake-ada",     displayName: "Ada Lovelace",  email: "", createdAt: "2024-01-01T00:00:00Z" },
  { id: "fake-barbara", displayName: "Barbara Okeke", email: "", createdAt: "2024-01-01T00:00:00Z" },
  { id: "fake-mei",     displayName: "Mei Tanaka",    email: "", createdAt: "2024-01-01T00:00:00Z" },
];

// Deterministically pick 1–4 unique stakers for a given frame::node key.
function pickStakers(key: string): Staker[] {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  const count = (h % 4) + 1;
  const seen = new Set<number>();
  const result: Staker[] = [];
  let seed = h;
  while (result.length < count) {
    seed = (seed * 1664525 + 1013904223) & 0xffff;
    const idx = seed % FAKE_STAKERS.length;
    if (!seen.has(idx)) {
      seen.add(idx);
      result.push(FAKE_STAKERS[idx]);
    }
  }
  return result;
}

export const devStakeMap = new Map<string, FrameNodeStakes>();

// Pre-seed all nodes for the Google Xi map structure (q1–q10, 5 claims each).
for (let q = 1; q <= 10; q++) {
  for (let c = 1; c <= 5; c++) {
    const key = `q${q}::q${q}c${c}`;
    const stakers = pickStakers(key);
    devStakeMap.set(key, { count: stakers.length, stakers, selfStaked: false });
  }
}
