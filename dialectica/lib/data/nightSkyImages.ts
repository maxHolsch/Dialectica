// Background images for empty map-card previews. Stored under public/night-sky/.
// Order is fixed so consecutive cards in the homepage grid each get a unique image.
export const NIGHT_SKY_IMAGES = [
  "/night-sky/cosmos_1035548825.jpeg",
  "/night-sky/cosmos_105503991.jpeg",
  "/night-sky/cosmos_1086675680.jpeg",
  "/night-sky/cosmos_1152074715.jpeg",
  "/night-sky/cosmos_1332862282.jpeg",
  "/night-sky/cosmos_1334202996.jpeg",
  "/night-sky/cosmos_1457220512.jpeg",
  "/night-sky/cosmos_1465578355.jpeg",
  "/night-sky/cosmos_1796693562.jpeg",
  "/night-sky/cosmos_1846402893.jpeg",
  "/night-sky/cosmos_334259591.jpeg",
  "/night-sky/cosmos_482364905.jpeg",
  "/night-sky/cosmos_511650195.jpeg",
  "/night-sky/cosmos_614783239.jpeg",
  "/night-sky/cosmos_659673344.jpeg",
  "/night-sky/cosmos_706702771.jpeg",
  "/night-sky/cosmos_784637633.jpeg",
  "/night-sky/cosmos_805475305.jpeg",
  "/night-sky/cosmos_9299704.jpeg",
] as const;

export function nightSkyImageForIndex(index: number): string {
  const i = ((index % NIGHT_SKY_IMAGES.length) + NIGHT_SKY_IMAGES.length) %
    NIGHT_SKY_IMAGES.length;
  return NIGHT_SKY_IMAGES[i];
}
