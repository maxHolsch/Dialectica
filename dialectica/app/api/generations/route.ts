import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { currentUser } from "@/lib/data/users";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runGenerationWorkflow } from "@/lib/ai/workflow";
import { runQuestionGuidedWorkflow } from "@/lib/ai/questionGuidedWorkflow";
import { uploadAudioSource, signedUrlFor } from "@/lib/ai/runStore";
import { DEFAULT_PARAMS, type PipelineParams } from "@/lib/ai/pipeline";
import { resolveStrategy } from "@/lib/layout/strategies";

// Two pipeline kinds (see ROADMAP Phase 7):
//   free_form       — original distill / organize / relate pipeline
//   question_guided — curator-selected sub-questions, claims pulled per
//                      question from the transcript, connections drawn with
//                      the transcript in context
type PipelineKind = "free_form" | "question_guided";

// POST /api/generations — kick off a new generation run.
// GET  /api/generations — list runs (edit-gated; admin UI consumer).
//
// Accepts multipart/form-data:
//   - source_kind: 'text' | 'audio'
//   - text:       (text path) the transcript
//   - audio:      (audio path) the .m4a / .mp3 file (uploaded to Blob first)
//   - title, top_question, params (JSON-encoded knobs)

export const runtime = "nodejs";
// Generations may upload audio files and start a workflow that takes minutes —
// don't apply the default 5s edge timeout.
export const maxDuration = 60;

function runIdSlug(): string {
  return `gen-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

export async function GET() {
  const user = await currentUser();
  if (!user || user.role !== "edit") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("Dialectica_generations")
    .select(
      "id, status, source_kind, source_label, params, error, map_id, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ runs: data ?? [] });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "edit") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const sourceKind = form.get("source_kind") as "text" | "audio" | null;
  const title = (form.get("title") as string | null) ?? "Untitled generation";
  const topQuestion =
    (form.get("top_question") as string | null) ?? "What is this map about?";
  const paramsRaw = form.get("params") as string | null;
  const params: PipelineParams = paramsRaw
    ? { ...DEFAULT_PARAMS, ...JSON.parse(paramsRaw) }
    : DEFAULT_PARAMS;

  // Pipeline kind: defaults to free_form for backwards compat with callers
  // that don't send the field (existing form, restart route).
  const pipelineKindRaw =
    (form.get("pipeline_kind") as string | null) ?? "free_form";
  const pipelineKind: PipelineKind =
    pipelineKindRaw === "question_guided" ? "question_guided" : "free_form";

  // Auto-format strategy for the freshly-built map. Optional; resolveStrategy
  // returns DEFAULT_STRATEGY when missing or unknown.
  const layoutStrategy = resolveStrategy(form.get("layout_strategy"));

  // For question-guided: the curator's committed selection of sub-questions.
  const selectedQuestionsRaw = form.get("selected_questions") as string | null;
  let selectedQuestions: string[] = [];
  if (pipelineKind === "question_guided") {
    try {
      const parsed = selectedQuestionsRaw
        ? JSON.parse(selectedQuestionsRaw)
        : [];
      selectedQuestions = Array.isArray(parsed)
        ? parsed.map((q) => String(q).trim()).filter(Boolean)
        : [];
    } catch {
      return NextResponse.json(
        { error: "selected_questions must be JSON-encoded string[]" },
        { status: 400 },
      );
    }
    if (selectedQuestions.length === 0) {
      return NextResponse.json(
        {
          error:
            "question-guided pipeline requires at least one selected sub-question",
        },
        { status: 400 },
      );
    }
  }

  if (!sourceKind || (sourceKind !== "text" && sourceKind !== "audio")) {
    return NextResponse.json(
      { error: "source_kind must be 'text' or 'audio'" },
      { status: 400 },
    );
  }
  if (pipelineKind === "question_guided" && sourceKind !== "text") {
    return NextResponse.json(
      {
        error:
          "question-guided pipeline currently supports text transcripts only — audio is on the free-form pipeline",
      },
      { status: 400 },
    );
  }

  const runId = runIdSlug();
  let source:
    | { kind: "text"; transcript: string }
    | { kind: "audio"; url: string };
  let sourceLabel: string;

  if (sourceKind === "text") {
    const text = (form.get("text") as string | null)?.trim() ?? "";
    if (!text) {
      return NextResponse.json(
        { error: "text source requires a non-empty 'text' field" },
        { status: 400 },
      );
    }
    source = { kind: "text", transcript: text };
    sourceLabel = `text (${text.length} chars)`;
  } else {
    const audio = form.get("audio") as File | null;
    if (!audio || audio.size === 0) {
      return NextResponse.json(
        { error: "audio source requires an 'audio' file upload" },
        { status: 400 },
      );
    }
    // Bucket is private — upload, then mint a signed URL right before we hand
    // it to AssemblyAI inside the workflow. 1-hour TTL covers the worst-case
    // queue delay; AssemblyAI pulls the file at job submission so the URL
    // doesn't need to outlive transcription itself.
    await uploadAudioSource(runId, audio);
    const signedAudioUrl = await signedUrlFor(`${runId}/source${
      (audio.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ".m4a").toLowerCase()
    }`);
    source = { kind: "audio", url: signedAudioUrl };
    sourceLabel = audio.name;
  }

  // Stamp pipelineKind + layoutStrategy onto params so the run-detail page can
  // tell pipelines apart and replay the same auto-format on restart.
  const storedParams = {
    ...params,
    pipelineKind,
    layoutStrategy,
    ...(pipelineKind === "question_guided"
      ? { selectedQuestions }
      : {}),
  };

  // Insert the run row up front so the admin page can render the "queued"
  // state immediately, before the workflow has done anything.
  const admin = createSupabaseAdminClient();
  const { error: insertErr } = await admin.from("Dialectica_generations").insert({
    id: runId,
    created_by: user.id,
    source_kind: sourceKind,
    source_label: sourceLabel,
    params: storedParams,
    status: "queued",
    title,
    top_question: topQuestion,
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Kick off the appropriate workflow. start() returns immediately — the
  // workflow runs asynchronously and writes status back as it progresses.
  const run =
    pipelineKind === "question_guided"
      ? await start(runQuestionGuidedWorkflow, [
          {
            runId,
            ownerId: user.id,
            // question-guided is text-only (guarded above), so source is
            // narrowed by control flow.
            transcript:
              source.kind === "text" ? source.transcript : "",
            subQuestions: selectedQuestions,
            params,
            title,
            topQuestion,
            layoutStrategy,
          },
        ])
      : await start(runGenerationWorkflow, [
          {
            runId,
            ownerId: user.id,
            source,
            params,
            title,
            topQuestion,
            layoutStrategy,
          },
        ]);

  await admin
    .from("Dialectica_generations")
    .update({ workflow_run_id: run.runId, updated_at: new Date().toISOString() })
    .eq("id", runId);

  return NextResponse.json({ runId, workflowRunId: run.runId }, { status: 201 });
}
