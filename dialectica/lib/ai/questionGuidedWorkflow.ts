import { FatalError } from "workflow";
import {
  stage1ExtractClaimsByQuestion,
  stage2RelateWithinQuestions,
  assembleQuestionGuidedOutput,
  type QuestionWithClaims,
} from "./questionGuidedPipeline";
import type {
  PipelineParams,
  Relationship,
  CrossQuestionRelationship,
} from "./pipeline";
import { mapToArgMap } from "./mapToArgMap";
import { PipelineJsonError } from "./jsonParse";
import {
  updateRun,
  uploadStageBlob,
  insertMap,
  recordStageUsage,
  appendLog,
} from "./runStore";
import { autoFormatArgMap } from "@/lib/layout/autoFormatArgMap";
import {
  resolveStrategy,
  type LayoutStrategyId,
} from "@/lib/layout/strategies";

// Phase 7 (DIA-AI-1) — Vercel Workflow for the question-guided pipeline.
//
// Sibling to runGenerationWorkflow in workflow.ts. Same step-per-stage pattern
// so each intermediate JSON is persisted before the next stage runs and the
// admin run-detail page reuses its grid / blob viewers unchanged.
//
// Stages, mapped onto the existing `status` enum so we don't have to migrate
// the DB check constraint:
//   queued      → workflow accepted
//   extracting  → per-question claim extraction (Stage 1)
//   relating    → within-question + cross-question connections (Stage 2 + 3)
//   mapping     → assemble ArgMap and insert
//   succeeded   → done

type RunArgs = {
  runId: string;
  ownerId: string | null;
  transcript: string;
  subQuestions: string[];
  title: string;
  topQuestion: string;
  params: PipelineParams;
  /** Auto-format strategy applied right before insertMap. */
  layoutStrategy?: LayoutStrategyId;
};

async function stepUploadTranscript(runId: string, text: string) {
  "use step";
  console.log(`[gen ${runId}] step:upload_transcript len=${text.length}`);
  const path = await uploadStageBlob(runId, "transcript_path", text);
  await updateRun(runId, { transcript_path: path });
}

async function stepUploadSelectedQuestions(
  runId: string,
  subQuestions: string[],
) {
  "use step";
  console.log(
    `[gen ${runId}] step:upload_selected_questions count=${subQuestions.length}`,
  );
  const payload = {
    central_questions: subQuestions.map((q, i) => ({
      id: `q${i + 1}`,
      question: q,
      claim_ids: [] as string[], // populated later when claims are known
    })),
  };
  const path = await uploadStageBlob(runId, "questions_path", payload);
  await updateRun(runId, { questions_path: path });
}

async function stepExtractClaimsByQuestion(
  runId: string,
  transcript: string,
  subQuestions: string[],
  params: PipelineParams,
): Promise<QuestionWithClaims[]> {
  "use step";
  console.log(
    `[gen ${runId}] step:extract_by_question count=${subQuestions.length}`,
  );
  await updateRun(runId, { status: "extracting" });
  await appendLog(
    runId,
    "extract",
    `[question-guided] starting Stage 1: extract 4–5 claims per sub-question · ${subQuestions.length} sub-questions · model=${params.model}${params.effort !== "none" ? ` · effort=${params.effort}` : ""}`,
  );
  try {
    const { result, usage } = await stage1ExtractClaimsByQuestion(
      transcript,
      subQuestions,
      params,
      (msg) => appendLog(runId, "extract", msg),
    );
    const totalClaims = result.reduce((n, g) => n + g.claims.length, 0);
    await appendLog(
      runId,
      "extract",
      `extract done · ${totalClaims} claims across ${result.length} questions`,
    );
    // Reuse `distilled_path` for the canonical claim list so the run-detail
    // page's "Stage 2 — distilled claims" section works unchanged.
    const distilledPayload = {
      claims: result.flatMap((g) => g.claims),
    };
    const distilledPath = await uploadStageBlob(
      runId,
      "distilled_path",
      distilledPayload,
    );
    // Also rewrite questions_path with claim_ids populated, matching the
    // free-form pipeline's shape so the questions section renders right.
    const questionsPayload = {
      central_questions: result.map((g) => ({
        id: g.questionId,
        question: g.question,
        claim_ids: g.claims.map((c) => c.id),
      })),
    };
    const questionsPath = await uploadStageBlob(
      runId,
      "questions_path",
      questionsPayload,
    );
    await updateRun(runId, {
      distilled_path: distilledPath,
      questions_path: questionsPath,
    });
    await recordStageUsage(runId, "extract", usage, params.model);
    return result;
  } catch (e) {
    await persistPipelineFailure(runId, "extract", e);
    throw e;
  }
}

async function stepRelate(
  runId: string,
  transcript: string,
  groups: QuestionWithClaims[],
  params: PipelineParams,
): Promise<{
  within: Relationship[];
  cross: CrossQuestionRelationship[];
}> {
  "use step";
  console.log(`[gen ${runId}] step:relate groups=${groups.length}`);
  await updateRun(runId, { status: "relating" });
  await appendLog(
    runId,
    "relate",
    `[question-guided] starting Stage 2: draw connections within each question · transcript passed to model so notes are grounded in what was said · ${groups.length} questions`,
  );
  try {
    const within = await stage2RelateWithinQuestions(
      transcript,
      groups,
      params,
      (msg) => appendLog(runId, "relate", msg),
    );
    await recordStageUsage(runId, "relate", within.usage, params.model);

    const relationsPayload = {
      relationships: within.result,
      cross_question_relationships: [],
      momentum: {
        highest_leverage_question: groups[0]?.questionId ?? "",
        rationale:
          "Question-guided pipeline: cruxes were curator-selected, not inferred.",
        latent_agreements: [],
      },
    };
    const path = await uploadStageBlob(runId, "relations_path", relationsPayload);
    await updateRun(runId, { relations_path: path });

    await appendLog(
      runId,
      "relate",
      `relate done · ${within.result.length} within-question connections`,
    );
    return { within: within.result, cross: [] };
  } catch (e) {
    await persistPipelineFailure(runId, "relate", e);
    throw e;
  }
}

async function stepBuildMap(
  runId: string,
  ownerId: string | null,
  title: string,
  topQuestion: string,
  groups: QuestionWithClaims[],
  within: Relationship[],
  cross: CrossQuestionRelationship[],
  layoutStrategy: LayoutStrategyId,
): Promise<string> {
  "use step";
  console.log(`[gen ${runId}] step:build_map groups=${groups.length}`);
  await updateRun(runId, { status: "mapping" });
  await appendLog(runId, "map", "assembling ArgMap from question-guided output…");
  const mapId = `map-${runId}`;
  const pipeline = assembleQuestionGuidedOutput(groups, within, cross);
  const argMap = mapToArgMap({
    mapId,
    title,
    topQuestion,
    generationRunId: runId,
    pipeline,
  });

  let finalMap = argMap;
  try {
    finalMap = await autoFormatArgMap(argMap, layoutStrategy);
    await appendLog(runId, "map", `auto-format complete (${layoutStrategy})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[gen ${runId}] auto-format failed, falling back: ${msg}`);
    await appendLog(
      runId,
      "map",
      `auto-format failed (fallback to ring layout): ${msg}`,
    );
  }

  await insertMap(mapId, title, ownerId, finalMap);
  await appendLog(runId, "map", `map ${mapId} written · workflow complete`);
  await updateRun(runId, { status: "succeeded", map_id: mapId, error: null });
  return mapId;
}

async function persistPipelineFailure(
  runId: string,
  stage: string,
  err: unknown,
): Promise<never> {
  const msg =
    err instanceof PipelineJsonError
      ? `${stage}: invalid JSON after retry. Raw text:\n\n${err.rawText.slice(0, 4000)}`
      : err instanceof Error
        ? `${stage}: ${err.message}`
        : `${stage}: ${String(err)}`;
  await updateRun(runId, { status: "failed", error: msg });
  if (err instanceof PipelineJsonError) throw new FatalError(msg);
  throw err instanceof Error ? err : new Error(msg);
}

export async function runQuestionGuidedWorkflow(args: RunArgs) {
  "use workflow";

  console.log(
    `[gen ${args.runId}] question-guided workflow start · ${args.subQuestions.length} sub-questions`,
  );

  await stepUploadTranscript(args.runId, args.transcript);
  await stepUploadSelectedQuestions(args.runId, args.subQuestions);

  const groups = await stepExtractClaimsByQuestion(
    args.runId,
    args.transcript,
    args.subQuestions,
    args.params,
  );

  const { within, cross } = await stepRelate(
    args.runId,
    args.transcript,
    groups,
    args.params,
  );

  const mapId = await stepBuildMap(
    args.runId,
    args.ownerId,
    args.title,
    args.topQuestion,
    groups,
    within,
    cross,
    resolveStrategy(args.layoutStrategy),
  );

  return { mapId };
}
