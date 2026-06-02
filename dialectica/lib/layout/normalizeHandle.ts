// Bridges legacy single-anchor handle ids ("src-top") to the slotted form
// the node components now render ("src-top-{0..4}"). Maps generated before
// the slot rollout have edges saved as the legacy form; if we hand those
// directly to xyflow it logs "Couldn't create edge for source handle id"
// and drops the edge. Snap legacy ids to slot 2 (the middle of the side) so
// they render in roughly the same spot they used to. AUTO-FORMAT then
// rewrites them in proper distributed form on the next run.

const LEGACY = /^(src|tgt)-(top|bottom|left|right)$/;

export function normalizeHandleId(
  id: string | undefined,
): string | undefined {
  if (!id) return undefined;
  if (LEGACY.test(id)) return `${id}-2`;
  return id;
}
