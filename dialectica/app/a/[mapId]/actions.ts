"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  artifactCookieName,
  artifactTokenFor,
  checkArtifactPassword,
  resolveArtifactSlug,
} from "@/lib/artifact";

export async function unlockArtifact(slug: string, formData: FormData) {
  const mapId = resolveArtifactSlug(slug);
  if (!mapId) redirect("/");
  const attempt = String(formData.get("password") ?? "");
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
  redirect(`/m/${mapId}/crux`);
}
