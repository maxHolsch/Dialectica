import { NextResponse } from "next/server";
import { currentUser } from "@/lib/data/users";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMapData } from "@/lib/ai/runStore";
import { isArtifactUnlocked } from "@/lib/artifact";

// GET /api/maps/[mapId]/audio — mint a fresh signed URL for the map's recording.
//
// The snippet drawer calls this on open. Works whether the audio bucket is
// public or private (we always sign), and the signed URL honors HTTP Range so
// the <audio> element only fetches the bytes around each snippet's span.

export const runtime = "nodejs";

const DEFAULT_AUDIO_BUCKET = "dialectica-audio";
// 12h covers a long listening session without re-fetching.
const SIGNED_TTL_SECONDS = 60 * 60 * 12;

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ mapId: string }> },
) {
  const { mapId } = await ctx.params;
  const user = await currentUser();
  if (!user && !(await isArtifactUnlocked(mapId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  type AudioRef = { bucket?: string; path?: string };
  const raw = (await getMapData(mapId)) as {
    meta?: { audio?: AudioRef; audioSources?: Record<string, AudioRef> };
  } | null;
  const audio = raw?.meta?.audio;
  if (!audio?.path) {
    return NextResponse.json(
      { error: "no audio configured for this map" },
      { status: 404 },
    );
  }

  const admin = createSupabaseAdminClient();

  async function sign(ref: AudioRef): Promise<string | null> {
    if (!ref.path) return null;
    const { data, error } = await admin.storage
      .from(ref.bucket ?? DEFAULT_AUDIO_BUCKET)
      .createSignedUrl(ref.path, SIGNED_TTL_SECONDS);
    return error || !data ? null : data.signedUrl;
  }

  // Primary recording. Failing to sign it is a hard error (the drawer can't
  // play anything without it).
  const primaryUrl = await sign(audio);
  if (!primaryUrl) {
    return NextResponse.json(
      { error: "could not sign audio url" },
      { status: 500 },
    );
  }

  // Additional recordings (breakout-table mics, etc.). A snippet references one
  // by `sourceId`; the drawer picks the matching signed URL per snippet. Sign
  // each best-effort — a single bad source shouldn't 500 the whole drawer.
  const sourceRefs = raw?.meta?.audioSources ?? {};
  const sources: Record<string, string> = {};
  await Promise.all(
    Object.entries(sourceRefs).map(async ([id, ref]) => {
      const url = await sign(ref);
      if (url) sources[id] = url;
    }),
  );

  return NextResponse.json({ url: primaryUrl, sources });
}
