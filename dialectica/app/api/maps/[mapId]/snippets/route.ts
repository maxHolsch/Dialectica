import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { currentUser } from "@/lib/data/users";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runSnippetWorkflow } from "@/lib/ai/snippetWorkflow";
import { type ModelId, type Effort } from "@/lib/ai/pricing";

// POST /api/maps/[mapId]/snippets — standalone snippet pipeline.
//
// Finds the top-N related transcript snippets (with audio timestamps) for every
// claim on an EXISTING map and writes them back onto the map. Re-runnable.
// Body (JSON): { model?, effort?, audioPath?, audioDurationMs?, idealCount?, minCount?, maxCount?, batchSize? }

export const runtime = "nodejs";
export const maxDuration = 60;

// Storage bucket holding the conversation recordings (one compressed file per
// conversation). Served via signed URLs (/api/maps/[mapId]/audio), so it can be
// public or private.
const AUDIO_BUCKET = "dialectica-audio";
// Sensible defaults for the Google Xi Test7 recording (tetrad_room_recording).
const DEFAULT_AUDIO_PATH = "google-xi-test7.mp3";
const DEFAULT_AUDIO_DURATION_MS = 13_594_000; // 3:46:34

function runIdSlug(): string {
  return `snip-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ mapId: string }> },
) {
  const user = await currentUser();
  if (!user || user.role !== "edit") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { mapId } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    model?: string;
    effort?: string;
    audioPath?: string;
    audioDurationMs?: number;
    idealCount?: number;
    minCount?: number;
    maxCount?: number;
    batchSize?: number;
  };

  const model = (body.model ?? "claude-sonnet-4.6") as ModelId;
  const effort = (body.effort ?? "none") as Effort | "none";
  const audioPath = body.audioPath?.trim() || DEFAULT_AUDIO_PATH;
  const audioDurationMs = body.audioDurationMs ?? DEFAULT_AUDIO_DURATION_MS;
  // Snippets-per-claim range: clamp ≥1 and enforce min ≤ ideal ≤ max.
  const minCount = Math.max(1, body.minCount ?? 3);
  const maxCount = Math.max(minCount, body.maxCount ?? 8);
  const idealCount = Math.min(maxCount, Math.max(minCount, body.idealCount ?? 5));
  const snippetRange = { ideal: idealCount, min: minCount, max: maxCount };
  const batchSize = body.batchSize ?? 12;

  const admin = createSupabaseAdminClient();

  // Confirm the target map exists so the operator gets a clean error.
  const { data: mapRow, error: mapErr } = await admin
    .from("Dialectica_maps")
    .select("id")
    .eq("id", mapId)
    .maybeSingle();
  if (mapErr) {
    return NextResponse.json({ error: mapErr.message }, { status: 500 });
  }
  if (!mapRow) {
    return NextResponse.json({ error: `map ${mapId} not found` }, { status: 404 });
  }

  const runId = runIdSlug();
  const { error: insertErr } = await admin.from("Dialectica_generations").insert({
    id: runId,
    created_by: user.id,
    job_kind: "snippets",
    source_kind: "text", // no source upload; placeholder to satisfy the constraint
    source_label: `snippets · ${mapId}`,
    params: { model, effort, snippetRange, batchSize, audioPath, mapId },
    status: "queued",
    map_id: mapId,
    title: `Audio snippets · ${mapId}`,
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const run = await start(runSnippetWorkflow, [
    {
      runId,
      mapId,
      model,
      effort,
      audioPath,
      audioBucket: AUDIO_BUCKET,
      audioDurationMs,
      snippetRange,
      batchSize,
    },
  ]);

  await admin
    .from("Dialectica_generations")
    .update({ workflow_run_id: run.runId, updated_at: new Date().toISOString() })
    .eq("id", runId);

  return NextResponse.json({ runId, workflowRunId: run.runId }, { status: 201 });
}
