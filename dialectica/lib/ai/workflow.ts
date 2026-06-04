import { FatalError } from "workflow";
import { transcribeAudioUrl } from "./assemblyai";
import {
  stage1Extract,
  stage2Distill,
  stage3Organize,
  stage4Relate,
  factCheckSideLayer,
  stage5Quotes,
  DEFAULT_PARAMS,
  type PipelineParams,
  type RawClaim,
  type DistilledClaim,
  type CentralQuestion,
  type Relationship,
  type CrossQuestionRelationship,
  type MomentumLens,
  type FactCheckTodoRaw,
  type ClaimQuoteEntry,
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
import type { StageUsage } from "./pricing";

// Phase 7 (DIA-AI-1) — Vercel Workflow that drives the generation pipeline.
//
// One step per pipeline stage so:
//   1. Each stage's intermediate JSON is uploaded to storage before the next
//      stage runs — if a later stage crashes the workflow resumes from the
//      last completed step rather than re-paying for the expensive LLM calls
//      already done.
//   2. The admin run-detail page can render each stage's JSON inline.
//   3. The admin "Cost so far" tally accumulates as each step ends: every
//      stage records its token usage on the run row, the page renders a
//      running USD total from `MODEL_PRICING`.

// Step inputs/outputs must be serializable per Workflow DevKit. We hand the
// pipeline JSON between steps via plain objects.

type RunArgs = {
  runId: string;
  ownerId: string | null;
  source: { kind: "text"; transcript: string } | { kind: "audio"; url: string };
  params: PipelineParams;
  title: string;
  topQuestion: string;
  /** Auto-format strategy applied right before insertMap. */
  layoutStrategy?: LayoutStrategyId;
};

async function stepTranscribe(runId: string, audioUrl: string): Promise<string> {
  "use step";
  console.log(`[gen ${runId}] step:transcribe url=${audioUrl}`);
  await updateRun(runId, { status: "transcribing" });
  await appendLog(runId, "transcribe", "submitting audio to AssemblyAI…");
  const text = await transcribeAudioUrl(audioUrl);
  await appendLog(
    runId,
    "transcribe",
    `transcript received (${text.length.toLocaleString()} chars)`,
  );
  const path = await uploadStageBlob(runId, "transcript_path", text);
  await updateRun(runId, { transcript_path: path });
  return text;
}

async function stepExtract(
  runId: string,
  transcript: string,
  params: PipelineParams,
): Promise<RawClaim[]> {
  "use step";
  console.log(`[gen ${runId}] step:extract transcript_len=${transcript.length}`);
  await updateRun(runId, { status: "extracting" });
  await appendLog(
    runId,
    "extract",
    `starting Stage 1 (extract) · model=${params.model}${params.effort !== "none" ? ` · effort=${params.effort}` : ""}`,
  );
  try {
    const { result, usage } = await stage1Extract(
      transcript,
      params,
      (msg) => appendLog(runId, "extract", msg),
    );
    await appendLog(
      runId,
      "extract",
      `Stage 1 done · ${result.length} raw claims · ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out`,
    );
    const path = await uploadStageBlob(runId, "raw_claims_path", result);
    await updateRun(runId, { raw_claims_path: path });
    await recordStageUsage(runId, "extract", usage, params.model);
    return result;
  } catch (e) {
    await persistPipelineFailure(runId, "extract", e);
    throw e;
  }
}

async function stepDistill(
  runId: string,
  rawClaims: RawClaim[],
  params: PipelineParams,
): Promise<{ claims: DistilledClaim[] }> {
  "use step";
  console.log(`[gen ${runId}] step:distill raw_count=${rawClaims.length}`);
  await updateRun(runId, { status: "distilling" });
  await appendLog(
    runId,
    "distill",
    `starting Stage 2 (distill) · ${rawClaims.length} raw claims in · dedup=${params.dedupLevel}`,
  );
  try {
    const { result, usage } = await stage2Distill(rawClaims, params, (msg) =>
      appendLog(runId, "distill", msg),
    );
    await appendLog(
      runId,
      "distill",
      `Stage 2 done · ${result.claims.length} canonical claims (collapsed from ${rawClaims.length})`,
    );
    const path = await uploadStageBlob(runId, "distilled_path", result);
    await updateRun(runId, { distilled_path: path });
    await recordStageUsage(runId, "distill", usage, params.model);
    return result;
  } catch (e) {
    await persistPipelineFailure(runId, "distill", e);
    throw e;
  }
}

async function stepOrganize(
  runId: string,
  distilled: { claims: DistilledClaim[] },
  params: PipelineParams,
): Promise<{ central_questions: CentralQuestion[] }> {
  "use step";
  console.log(`[gen ${runId}] step:organize claim_count=${distilled.claims.length}`);
  await updateRun(runId, { status: "organizing" });
  await appendLog(
    runId,
    "organize",
    `starting Stage 3 (organize) · target ${params.nQuestions} central questions`,
  );
  try {
    const { result, usage } = await stage3Organize(distilled, params);
    await appendLog(
      runId,
      "organize",
      `Stage 3 done · ${result.central_questions.length} central questions`,
    );
    const path = await uploadStageBlob(runId, "questions_path", result);
    await updateRun(runId, { questions_path: path });
    await recordStageUsage(runId, "organize", usage, params.model);
    return result;
  } catch (e) {
    await persistPipelineFailure(runId, "organize", e);
    throw e;
  }
}

async function stepRelate(
  runId: string,
  distilled: { claims: DistilledClaim[] },
  questions: { central_questions: CentralQuestion[] },
  params: PipelineParams,
): Promise<{
  relationships: Relationship[];
  cross_question_relationships: CrossQuestionRelationship[];
  momentum: MomentumLens;
}> {
  "use step";
  console.log(`[gen ${runId}] step:relate q_count=${questions.central_questions.length}`);
  await updateRun(runId, { status: "relating" });
  await appendLog(
    runId,
    "relate",
    `starting Stage 4 (relate + momentum) · ${distilled.claims.length} claims across ${questions.central_questions.length} questions`,
  );
  try {
    const { result, usage } = await stage4Relate(distilled, questions, params);
    await appendLog(
      runId,
      "relate",
      `Stage 4 done · ${result.relationships.length} within-question · ${result.cross_question_relationships.length} cross-question · highest-leverage: ${result.momentum.highest_leverage_question}`,
    );
    const path = await uploadStageBlob(runId, "relations_path", result);
    await updateRun(runId, { relations_path: path });
    await recordStageUsage(runId, "relate", usage, params.model);
    return result;
  } catch (e) {
    await persistPipelineFailure(runId, "relate", e);
    throw e;
  }
}

async function stepFactCheck(
  runId: string,
  distilled: { claims: DistilledClaim[] },
  params: PipelineParams,
): Promise<{ fact_check_todos: FactCheckTodoRaw[] }> {
  "use step";
  console.log(`[gen ${runId}] step:fact_check claim_count=${distilled.claims.length}`);
  await updateRun(runId, { status: "fact_checking" });
  await appendLog(
    runId,
    "fact_check",
    `starting fact-check side layer · scanning ${distilled.claims.length} claims`,
  );
  try {
    const { result, usage } = await factCheckSideLayer(distilled, params);
    await appendLog(
      runId,
      "fact_check",
      `fact-check done · ${result.fact_check_todos.length} todos`,
    );
    const path = await uploadStageBlob(runId, "fact_check_path", result);
    await updateRun(runId, { fact_check_path: path });
    await recordStageUsage(runId, "fact_check", usage, params.model);
    return result;
  } catch (e) {
    await persistPipelineFailure(runId, "fact_check", e);
    throw e;
  }
}

async function stepQuotes(
  runId: string,
  distilled: { claims: DistilledClaim[] },
  transcript: string,
  params: PipelineParams,
): Promise<{ claim_quotes: ClaimQuoteEntry[] }> {
  "use step";
  console.log(`[gen ${runId}] step:quotes claim_count=${distilled.claims.length} transcript_len=${transcript.length}`);
  await updateRun(runId, { status: "quoting" });
  await appendLog(
    runId,
    "quotes",
    `starting Stage 5 (quote retrieval) · ${distilled.claims.length} claims · ${transcript.length.toLocaleString()} chars transcript`,
  );
  try {
    const { result, usage } = await stage5Quotes(distilled, transcript, params);
    const total = (result.claim_quotes ?? []).reduce(
      (n, e) => n + (e.quotes?.length ?? 0),
      0,
    );
    await appendLog(
      runId,
      "quotes",
      `Stage 5 done · ${total} quotes across ${result.claim_quotes?.length ?? 0} claims`,
    );
    const path = await uploadStageBlob(runId, "quotes_path", result);
    await updateRun(runId, { quotes_path: path });
    await recordStageUsage(runId, "quotes", usage, params.model);
    return result;
  } catch (e) {
    await persistPipelineFailure(runId, "quotes", e);
    throw e;
  }
}

async function stepBuildMap(
  runId: string,
  ownerId: string | null,
  title: string,
  topQuestion: string,
  distilled: { claims: DistilledClaim[] },
  questions: { central_questions: CentralQuestion[] },
  relations: {
    relationships: Relationship[];
    cross_question_relationships: CrossQuestionRelationship[];
    momentum: MomentumLens;
  },
  factCheck: { fact_check_todos: FactCheckTodoRaw[] },
  quotes: { claim_quotes: ClaimQuoteEntry[] },
  layoutStrategy: LayoutStrategyId,
): Promise<string> {
  "use step";
  console.log(`[gen ${runId}] step:build_map q=${questions.central_questions.length} c=${distilled.claims.length}`);
  await updateRun(runId, { status: "mapping" });
  await appendLog(runId, "map", "assembling ArgMap from pipeline output…");
  const mapId = `map-${runId}`;
  const argMap = mapToArgMap({
    mapId,
    title,
    topQuestion,
    generationRunId: runId,
    pipeline: {
      claims: distilled.claims,
      central_questions: questions.central_questions,
      relationships: relations.relationships,
      cross_question_relationships: relations.cross_question_relationships,
      momentum: relations.momentum,
      fact_check_todos: factCheck.fact_check_todos,
      claim_quotes: quotes.claim_quotes ?? [],
    },
  });

  // Auto-format the freshly-assembled map so the first "Open Map" lands on a
  // clean layout. On failure we log + fall through to the ring layout from
  // mapToArgMap so a buggy ELK run never blocks workflow completion.
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

// Persist a pipeline JSON-parse failure with the raw text included. Workflow
// DevKit's retry will re-run the step on a transient error; FatalError stops
// the retry (because the model returned invalid JSON twice in a row and a
// third attempt isn't worth the cost).
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
  if (err instanceof PipelineJsonError) {
    throw new FatalError(msg);
  }
  throw err instanceof Error ? err : new Error(msg);
}

export async function runGenerationWorkflow(args: RunArgs) {
  "use workflow";

  console.log(`[gen ${args.runId}] workflow start source=${args.source.kind}`);
  // Stage 0 — transcript. Text input skips AssemblyAI; audio routes through it.
  const transcript =
    args.source.kind === "audio"
      ? await stepTranscribe(args.runId, args.source.url)
      : args.source.transcript;

  // Persist the inline transcript path too, for parity with the audio path —
  // makes the admin "raw transcript" view a single fetch in both cases.
  if (args.source.kind === "text") {
    await stepUploadInlineTranscript(args.runId, transcript);
  }

  const rawClaims = await stepExtract(args.runId, transcript, args.params);
  const distilled = await stepDistill(args.runId, rawClaims, args.params);
  const questions = await stepOrganize(args.runId, distilled, args.params);
  const relations = await stepRelate(
    args.runId,
    distilled,
    questions,
    args.params,
  );
  // Stage 5 and fact-check are independent — run sequentially here because
  // the Workflow DevKit serializes steps, but both read only from distilled.
  const factCheck = await stepFactCheck(args.runId, distilled, args.params);
  const quotes = await stepQuotes(args.runId, distilled, transcript, args.params);

  const mapId = await stepBuildMap(
    args.runId,
    args.ownerId,
    args.title,
    args.topQuestion,
    distilled,
    questions,
    relations,
    factCheck,
    quotes,
    resolveStrategy(args.layoutStrategy),
  );

  return { mapId };
}

async function stepUploadInlineTranscript(runId: string, text: string) {
  "use step";
  console.log(`[gen ${runId}] step:upload_inline_transcript len=${text.length}`);
  const path = await uploadStageBlob(runId, "transcript_path", text);
  await updateRun(runId, { transcript_path: path });
}

// Re-export so the form helper can read it without importing pipeline.ts
// (which pulls the AI SDK into client bundles otherwise).
export { DEFAULT_PARAMS };
export type { StageUsage };
