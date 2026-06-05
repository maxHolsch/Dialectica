import "server-only";
import { cookies } from "next/headers";
import crypto from "node:crypto";

// Artifact mode: a shareable, password-gated view of a single map for users who
// don't have a Dialectica account. ARTIFACT_MAPS is keyed by real DB mapId →
// password (case-insensitive). ARTIFACT_SLUGS lets the share URL stay readable
// (/a/google-xi-test7) without exposing the underlying generated id.
export const ARTIFACT_MAPS: Record<string, string> = {
  "map-gen-nyiz0g-mpzuxlzq": "ccc",
};

export const ARTIFACT_SLUGS: Record<string, string> = {
  "google-xi-test7": "map-gen-nyiz0g-mpzuxlzq",
};

export function resolveArtifactSlug(slugOrId: string): string | null {
  if (slugOrId in ARTIFACT_MAPS) return slugOrId;
  return ARTIFACT_SLUGS[slugOrId] ?? null;
}

export function artifactCookieName(mapId: string): string {
  return `dia_artifact_${mapId}`;
}

// HMAC over (mapId:password) so the cookie value can't be guessed from the mapId
// alone — defense in depth on top of the HttpOnly flag.
export function artifactTokenFor(mapId: string): string | null {
  const pwd = ARTIFACT_MAPS[mapId];
  if (!pwd) return null;
  const secret = process.env.ARTIFACT_SECRET ?? "dia-artifact-fallback-salt";
  return crypto
    .createHmac("sha256", secret)
    .update(`${mapId}:${pwd.toLowerCase()}`)
    .digest("hex");
}

export async function isArtifactUnlocked(mapId: string): Promise<boolean> {
  const expected = artifactTokenFor(mapId);
  if (!expected) return false;
  const jar = await cookies();
  return jar.get(artifactCookieName(mapId))?.value === expected;
}

export function checkArtifactPassword(mapId: string, attempt: string): boolean {
  const pwd = ARTIFACT_MAPS[mapId];
  if (!pwd) return false;
  return attempt.trim().toLowerCase() === pwd.toLowerCase();
}
