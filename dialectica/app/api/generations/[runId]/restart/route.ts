import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { currentUser } from "@/lib/data/users";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runGenerationWorkflow } from "@/lib/ai/workflow";
import { downloadBlobText, signedUrlFor } from "@/lib/ai/runStore";
import { DEFAULT_PARAMS, type PipelineParams } from "@/lib/ai/pipeline";

// POST /api/generations/[runId]/restart — clone the source + params + title
// into a brand-new run with a fresh runId, and kick off a new workflow. The
// original run row is untouched; this is "start a new run with the same
// inputs," not "rerun the same run in place." Restart-in-place is harder
// (in-flight workflow state would need to be cancelled) and not worth it for
// a curator-facing tool.

export const runtime = "nodejs";
export const maxDuration = 60;

function runIdSlug(): string {
  return `gen-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  const user = await currentUser();
  if (!user || user.role !== "edit") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { runId: oldRunId } = await ctx.params;
  const admin = createSupabaseAdminClient();

  const { data: old, error: readErr } = await admin
    .from("Dialectica_generations")
    .select("*")
    .eq("id", oldRunId)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!old) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Pull title / top_question off the row. Older rows (pre-Phase-7.1) may not
  // have these stored — fall back to sane defaults so restart still works.
  const title = (old.title as string | null) ?? "Untitled (restart)";
  const topQuestion =
    (old.top_question as string | null) ?? "What is this map about?";

  // Reconstruct the source. Text runs have the transcript persisted as a
  // stage blob; audio runs have a source.* file we can re-sign.
  let source:
    | { kind: "text"; transcript: string }
    | { kind: "audio"; url: string };

  if (old.source_kind === "text") {
    if (!old.transcript_path) {
      return NextResponse.json(
        { error: "original run has no transcript blob — cannot restart" },
        { status: 400 },
      );
    }
    const transcript = await downloadBlobText(old.transcript_path);
    if (!transcript) {
      return NextResponse.json(
        { error: "transcript blob missing in storage" },
        { status: 500 },
      );
    }
    source = { kind: "text", transcript };
  } else {
    // Audio: find the source.* file in the old run's folder, re-mint a signed
    // URL. The filename's extension was preserved at upload time.
    const { data: files } = await admin.storage
      .from("dialectica_generations")
      .list(oldRunId);
    const sourceFile = files?.find((f) => f.name.startsWith("source."));
    if (!sourceFile) {
      return NextResponse.json(
        { error: "audio source file missing in storage — cannot restart" },
        { status: 500 },
      );
    }
    const url = await signedUrlFor(`${oldRunId}/${sourceFile.name}`);
    source = { kind: "audio", url };
  }

  // Merge params with defaults defensively in case the stored row was created
  // before some field was added (e.g. `model`, `effort`).
  const params: PipelineParams = {
    ...DEFAULT_PARAMS,
    ...((old.params as Partial<PipelineParams> | null) ?? {}),
  };

  const newRunId = runIdSlug();
  const { error: insertErr } = await admin
    .from("Dialectica_generations")
    .insert({
      id: newRunId,
      created_by: user.id,
      source_kind: old.source_kind,
      source_label: old.source_label,
      params,
      status: "queued",
      title,
      top_question: topQuestion,
    });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const run = await start(runGenerationWorkflow, [
    {
      runId: newRunId,
      ownerId: user.id,
      source,
      params,
      title,
      topQuestion,
    },
  ]);

  await admin
    .from("Dialectica_generations")
    .update({
      workflow_run_id: run.runId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", newRunId);

  return NextResponse.json(
    { runId: newRunId, workflowRunId: run.runId },
    { status: 201 },
  );
}
