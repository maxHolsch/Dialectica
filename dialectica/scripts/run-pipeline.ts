/**
 * Standalone pipeline runner — no Supabase required.
 *
 * Reads the labeled transcript from /tmp/tetrad-transcript.txt (or a path
 * passed as the first argument), runs the full 5-stage pipeline + fact-check,
 * and writes the resulting ArgMap JSON to /tmp/dialectica-map.json.
 *
 * Intermediate stage results are cached under /tmp/dialectica-pipeline/ so a
 * re-run after a crash resumes from the last completed stage without re-paying
 * for the work already done.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/run-pipeline.ts
 *   node --env-file=.env.local --import tsx scripts/run-pipeline.ts /path/to/transcript.txt
 *   # Force a fresh run (ignore cache):
 *   node --env-file=.env.local --import tsx scripts/run-pipeline.ts --fresh
 */

// Increase undici's default headersTimeout (30 s) to 10 min so large distill
// merge calls don't time out waiting for the API to start responding.
import { setGlobalDispatcher, Agent } from "undici";
setGlobalDispatcher(
  new Agent({ headersTimeout: 600_000, bodyTimeout: 900_000 }),
);

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
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
} from "@/lib/ai/pipeline";
import { mapToArgMap } from "@/lib/ai/mapToArgMap";
import { costUsd, formatUsd, addUsage, emptyUsage } from "@/lib/ai/pricing";
import type { StageUsage } from "@/lib/ai/pricing";

const fresh = process.argv.includes("--fresh");
const transcriptPath =
  process.argv.find((a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1]) ??
  "/tmp/tetrad-transcript.txt";
const outputPath = "/tmp/dialectica-map.json";
const cacheDir = "/tmp/dialectica-pipeline";

const params: PipelineParams = {
  ...DEFAULT_PARAMS,
  model: "claude-sonnet-4.6",
  effort: "none",
};

function log(stage: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] [${stage}] ${msg}\n`);
}

function summariseUsage(stage: string, usage: StageUsage) {
  const cost = formatUsd(costUsd(usage, params.model));
  log(stage, `in=${usage.inputTokens.toLocaleString()} out=${usage.outputTokens.toLocaleString()} cost=${cost}`);
}

function cachePath(name: string): string {
  return `${cacheDir}/${name}.json`;
}

function loadCache<T>(name: string): T | null {
  if (fresh) return null;
  const p = cachePath(name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

function saveCache(name: string, data: unknown): void {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath(name), JSON.stringify(data, null, 2), "utf-8");
}

async function main() {
  mkdirSync(cacheDir, { recursive: true });

  log("init", `reading transcript from ${transcriptPath}`);
  const transcript = readFileSync(transcriptPath, "utf-8");
  log("init", `transcript: ${transcript.length.toLocaleString()} chars`);
  if (fresh) log("init", "fresh flag set — ignoring cached intermediates");

  let totalUsage = emptyUsage();

  // Stage 1 — Extract
  let rawClaims: RawClaim[];
  const cached1 = loadCache<RawClaim[]>("1-rawClaims");
  if (cached1) {
    rawClaims = cached1;
    log("extract", `loaded from cache · ${rawClaims.length} raw claims`);
  } else {
    log("extract", "starting stage 1 (extract)…");
    const { result, usage } = await stage1Extract(transcript, params, (msg) =>
      log("extract", msg),
    );
    rawClaims = result;
    summariseUsage("extract", usage);
    totalUsage = addUsage(totalUsage, usage);
    saveCache("1-rawClaims", rawClaims);
    log("extract", `${rawClaims.length} raw claims · cached`);
  }

  // Stage 2 — Distill
  let distilled: { claims: DistilledClaim[] };
  const cached2 = loadCache<{ claims: DistilledClaim[] }>("2-distilled");
  if (cached2) {
    distilled = cached2;
    log("distill", `loaded from cache · ${distilled.claims.length} canonical claims`);
  } else {
    log("distill", "starting stage 2 (distill)…");
    const { result, usage } = await stage2Distill(rawClaims, params, (msg) =>
      log("distill", msg),
    );
    distilled = result;
    summariseUsage("distill", usage);
    totalUsage = addUsage(totalUsage, usage);
    saveCache("2-distilled", distilled);
    log("distill", `${distilled.claims.length} canonical claims · cached`);
  }

  // Stage 3 — Organize
  let questions: { central_questions: CentralQuestion[] };
  const cached3 = loadCache<{ central_questions: CentralQuestion[] }>("3-questions");
  if (cached3) {
    questions = cached3;
    log("organize", `loaded from cache · ${questions.central_questions.length} questions`);
  } else {
    log("organize", "starting stage 3 (organize)…");
    const { result, usage } = await stage3Organize(distilled, params);
    questions = result;
    summariseUsage("organize", usage);
    totalUsage = addUsage(totalUsage, usage);
    saveCache("3-questions", questions);
    log("organize", `${questions.central_questions.length} central questions · cached`);
  }

  // Stage 4 — Relate
  let relations: {
    relationships: Relationship[];
    cross_question_relationships: CrossQuestionRelationship[];
    momentum: MomentumLens;
  };
  const cached4 = loadCache<typeof relations>("4-relations");
  if (cached4) {
    relations = cached4;
    log("relate", `loaded from cache · ${relations.relationships.length} within-q · ${relations.cross_question_relationships.length} cross-q`);
  } else {
    log("relate", "starting stage 4 (relate)…");
    const { result, usage } = await stage4Relate(distilled, questions, params);
    relations = result;
    summariseUsage("relate", usage);
    totalUsage = addUsage(totalUsage, usage);
    saveCache("4-relations", relations);
    log("relate", `${relations.relationships.length} within-q · ${relations.cross_question_relationships.length} cross-q · cached`);
  }

  // Fact-check
  let factCheck: { fact_check_todos: FactCheckTodoRaw[] };
  const cachedFC = loadCache<typeof factCheck>("5-factcheck");
  if (cachedFC) {
    factCheck = cachedFC;
    log("fact_check", `loaded from cache · ${factCheck.fact_check_todos.length} todos`);
  } else {
    log("fact_check", "starting fact-check side layer…");
    const { result, usage } = await factCheckSideLayer(distilled, params);
    factCheck = result;
    summariseUsage("fact_check", usage);
    totalUsage = addUsage(totalUsage, usage);
    saveCache("5-factcheck", factCheck);
    log("fact_check", `${factCheck.fact_check_todos.length} todos · cached`);
  }

  // Stage 5 — Quotes
  let quotesResult: { claim_quotes: ClaimQuoteEntry[] };
  const cachedQ = loadCache<typeof quotesResult>("6-quotes");
  if (cachedQ) {
    quotesResult = cachedQ;
    const n = (quotesResult.claim_quotes ?? []).reduce((acc, e) => acc + (e.quotes?.length ?? 0), 0);
    log("quotes", `loaded from cache · ${n} quotes`);
  } else {
    log("quotes", "starting stage 5 (quote retrieval) — sends full transcript, may take a few minutes…");
    const { result, usage } = await stage5Quotes(distilled, transcript, params);
    quotesResult = result;
    summariseUsage("quotes", usage);
    totalUsage = addUsage(totalUsage, usage);
    saveCache("6-quotes", quotesResult);
    const total = (quotesResult.claim_quotes ?? []).reduce((n, e) => n + (e.quotes?.length ?? 0), 0);
    log("quotes", `${total} quotes across ${quotesResult.claim_quotes?.length ?? 0} claims · cached`);
  }

  // Build the ArgMap
  log("map", "assembling ArgMap…");
  const mapId = `map-local-${Date.now().toString(36)}`;
  const argMap = mapToArgMap({
    mapId,
    title: "Tetrad conversation",
    topQuestion: "What is the central question of this conversation?",
    generationRunId: mapId,
    pipeline: {
      claims: distilled.claims,
      central_questions: questions.central_questions,
      relationships: relations.relationships,
      cross_question_relationships: relations.cross_question_relationships,
      momentum: relations.momentum,
      fact_check_todos: factCheck.fact_check_todos,
      claim_quotes: quotesResult.claim_quotes ?? [],
    },
  });

  writeFileSync(outputPath, JSON.stringify(argMap, null, 2), "utf-8");

  log("done", `ArgMap written to ${outputPath}`);
  log(
    "done",
    `total cost: ${formatUsd(costUsd(totalUsage, params.model))} (in=${totalUsage.inputTokens.toLocaleString()} out=${totalUsage.outputTokens.toLocaleString()})`,
  );
  log(
    "done",
    `nodes: ${Object.keys(argMap.nodes).length} · frames: ${Object.keys(argMap.frames).length} · cruxes: ${argMap.cruxes.length}`,
  );
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
