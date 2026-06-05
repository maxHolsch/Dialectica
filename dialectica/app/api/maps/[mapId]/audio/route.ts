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

  const raw = (await getMapData(mapId)) as {
    meta?: { audio?: { bucket?: string; path?: string } };
  } | null;
  const audio = raw?.meta?.audio;
  if (!audio?.path) {
    return NextResponse.json(
      { error: "no audio configured for this map" },
      { status: 404 },
    );
  }

  const bucket = audio.bucket ?? DEFAULT_AUDIO_BUCKET;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(audio.path, SIGNED_TTL_SECONDS);
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "could not sign audio url" },
      { status: 500 },
    );
  }
  return NextResponse.json({ url: data.signedUrl });
}
