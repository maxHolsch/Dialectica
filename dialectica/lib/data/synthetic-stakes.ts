import type { ArgMap } from "@/lib/schema";
import type { FrameNodeStakes, StakeMap, Staker } from "./stakes-types";
import { stakeKey } from "./stakes-types";

// 3 simulated participants — one per safe headshot (02.jpg, 04.png, 05.jpg).
// Max = 03.png, John = 01.png are excluded. 02.jpg and 05.jpg use .jpg so the
// hash function (which generates 01–04.png only) can never produce them for
// real users. All 3 are guaranteed distinct and collision-free.
const FAKE_STAKERS: Staker[] = [
  { id: "fake-ada",     displayName: "Ada Lovelace",  email: "", createdAt: "2024-01-01T00:00:00Z" },
  { id: "fake-barbara", displayName: "Barbara Okeke", email: "", createdAt: "2024-01-01T00:00:00Z" },
  { id: "fake-mei",     displayName: "Mei Tanaka",    email: "", createdAt: "2024-01-01T00:00:00Z" },
];

// Deterministically pick 1–4 unique stakers for a key string.
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
    if (!seen.has(idx)) { seen.add(idx); result.push(FAKE_STAKERS[idx]); }
  }
  return result;
}

/**
 * In development: merges synthetic stakers into every node's stake bucket so
 * the agree bar always shows a realistic crowd. Real stakes (including the
 * current user's agree) are preserved and take precedence.
 * No-op in production.
 */
export function mergeSyntheticStakes(
  map: ArgMap,
  real: StakeMap,
  currentUserId: string,
): StakeMap {
  if (process.env.NODE_ENV !== "development") return real;

  const merged: StakeMap = {};
  for (const [frameId, frame] of Object.entries(map.frames)) {
    for (const inst of frame.nodeInstances) {
      const key = stakeKey(frameId, inst.nodeId);
      const realBucket: FrameNodeStakes | undefined = real[key];
      const synthetic = pickStakers(key);
      const realStakers = realBucket?.stakers ?? [];
      // Add synthetic stakers that aren't already present as real stakers,
      // and exclude the current user (they appear via the real agree path).
      const extra = synthetic.filter(
        (s) => s.id !== currentUserId && !realStakers.find((r) => r.id === s.id),
      );
      const allStakers = [...realStakers, ...extra];
      merged[key] = {
        count: allStakers.length,
        stakers: allStakers,
        selfStaked: realBucket?.selfStaked ?? false,
      };
    }
  }
  return merged;
}
