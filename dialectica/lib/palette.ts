export const TILE_PALETTE = [
  { pale: "#ECD2C8", deep: "#B93500" }, // Orange
  { pale: "#C0D8F0", deep: "#0061C1" }, // Blue
  { pale: "#E5CBEE", deep: "#852CAB" }, // Purple
  { pale: "#C8E0E8", deep: "#1B718F" }, // Seafoam
  { pale: "#CDE5D4", deep: "#38844E" }, // Green
] as const;

export function cruxColorByIndex(index: number): { pale: string; deep: string } {
  return TILE_PALETTE[((index % TILE_PALETTE.length) + TILE_PALETTE.length) % TILE_PALETTE.length];
}
