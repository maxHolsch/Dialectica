// In-memory stake store for SKIP_AUTH=true dev mode.
// Shared between stakes.ts (read) and mutations.ts (write).
// Resets on server restart — never used in production.
import type { FrameNodeStakes } from "./stakes-types";

export const devStakeMap = new Map<string, FrameNodeStakes>();
