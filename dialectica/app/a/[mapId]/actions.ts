"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  artifactCookieName,
  artifactTokenFor,
  artifactVisitorCookieName,
  checkArtifactPassword,
  mintArtifactVisitorId,
  resolveArtifactSlug,
} from "@/lib/artifact";

export async function unlockArtifact(slug: string, formData: FormData) {
  const mapId = resolveArtifactSlug(slug);
  if (!mapId) redirect("/");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const attempt = String(formData.get("password") ?? "");
  if (!name || !email) {
    redirect(`/a/${slug}?error=fields`);
  }
  if (!checkArtifactPassword(mapId, attempt)) {
    redirect(`/a/${slug}?error=1`);
  }
  const token = artifactTokenFor(mapId)!;
  const jar = await cookies();
  jar.set({
    name: artifactCookieName(mapId),
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  // Mint a fresh visitor id every unlock so two people sharing the password
  // are counted distinctly by presence. Stored as a JSON cookie scoped to
  // this map.
  jar.set({
    name: artifactVisitorCookieName(mapId),
    value: JSON.stringify({ id: mintArtifactVisitorId(), name, email }),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(`/m/${mapId}/crux`);
}
