import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { tolerantJsonParse } from "./jsonParse";
import { chunkTranscript } from "./chunk";
import type { ModelId, Effort, StageUsage } from "./pricing";
import { emptyUsage } from "./pricing";

// =============================================================================
// PHASE 7 (DIA-AI-1) — generation pipeline.
//
// Prompts live as editable string constants at the top of this file by design.
// Curators must be able to tune wording without spelunking through helper code.
// Keep this file as the canonical prompt source — see ROADMAP Phase 7.
// =============================================================================

// Knobs are passed in per run and can be overridden from the admin UI. Defaults
// match ROADMAP Phase 7 §"Configurable knobs".
//
// `model` and `effort` are the two cost-shaping knobs:
//   - model: which Claude variant runs every stage (sonnet/opus/haiku)
//   - effort: extended-thinking budget. "none" disables thinking entirely.
//     Higher effort = more reasoning tokens (billed at output rate) but
//     usually noticeably better Stage-2 dedup and Stage-4 relationships.
export type PipelineParams = {
  granularity: "atomic" | "bundled";
  dedupLevel: "conservative" | "aggressive";
  nQuestions: number; // 3–7
  relationshipPalette: string[];
  model: ModelId;
  effort: Effort | "none";
};

export const DEFAULT_PARAMS: PipelineParams = {
  granularity: "atomic",
  dedupLevel: "conservative",
  nQuestions: 5,
  relationshipPalette: [
    "supports",
    "challenges",
    "qualifies",
    "reframes",
    "depends-on",
    "raises",
  ],
  model: "claude-sonnet-4.6",
  effort: "none",
};

// -----------------------------------------------------------------------------
// PROMPTS — edit freely. Stage outputs are described inline so the model knows
// exactly what JSON shape to emit. Every prompt insists on "return only JSON,
// no prose, no markdown" because tolerantJsonParse can fix small slips but
// fenced or chatty output wastes a retry.
// -----------------------------------------------------------------------------

export const PROMPT_STAGE_1_EXTRACT = ({
  granularity,
  chunkIndex,
  chunkCount,
}: {
  granularity: PipelineParams["granularity"];
  chunkIndex: number;
  chunkCount: number;
}) => `You are extracting raw claims from a discussion transcript.

GOAL: Catch everything. Over-include. Do NOT filter, rank, or merge. Later
stages will dedup and organize. Fidelity here is the whole point — silently
losing a claim is the worst failure mode.

GRANULARITY: ${granularity === "atomic" ? "atomic — one assertion per claim" : "bundled — keep tightly-clustered assertions together"}

HARD RULES (non-negotiable):
- De-personalize. Strip speaker names, "I think", "she said", quotes, timestamps.
- Each claim is a standalone, free-form assertion. NOT pro/con. NOT for/against.
- Factual claims and opinions both count as claims. Do not flag them yet.
- No truth judgments. No confidence scores. No commentary.

INPUT: chunk ${chunkIndex + 1} of ${chunkCount} of the transcript follows the
"TRANSCRIPT:" line below.

OUTPUT (return ONLY this JSON, no prose, no markdown fences):
{"claims":[{"text":"…"},{"text":"…"}]}`;

export const PROMPT_STAGE_2_DISTILL = ({
  dedupLevel,
}: {
  dedupLevel: PipelineParams["dedupLevel"];
}) => `You are distilling raw claims into a canonical set of distinct claims.

GOAL: Collapse restatements into the smallest set of canonical claims that
faithfully captures what was said. Ten restatements of one idea become ONE
canonical claim. Frequency is not importance.

DEDUP LEVEL: ${dedupLevel === "aggressive" ? "aggressive — merge near-paraphrases and tightly related claims" : "conservative — only merge near-identical restatements"}

HARD RULES:
- Every canonical claim MUST carry an "absorbed" array listing the raw claim
  texts it collapsed (verbatim). Humans audit merges via this field — leaving
  it empty for a merged claim is a critical failure.
- Set "is_factual": true ONLY for claims that are empirically checkable
  (a number, a date, a verifiable fact about the world). Opinions, normative
  claims, predictions about the future = false.
- Assign each canonical claim a stable id of the form "c1", "c2", … in order.
- No speaker names, quotes, or timestamps. Keep claims de-personalized.

INPUT: the raw claims to distill follow the "RAW CLAIMS:" line below.

OUTPUT (return ONLY this JSON, no prose, no markdown fences):
{"claims":[{"id":"c1","text":"…","is_factual":false,"absorbed":["…","…"]}]}`;

export const PROMPT_STAGE_3_ORGANIZE = ({
  nQuestions,
}: {
  nQuestions: number;
}) => `You are organizing canonical claims under central questions.

GOAL: Infer ${nQuestions} central questions the conversation revolves around.
Attach each claim to the question it most directly bears on. A claim may
attach to more than one question. Not every claim must attach.

HARD RULES:
- Target ${nQuestions} questions. If the material genuinely supports fewer or
  more, you may emit 3 to 7 — but bias toward the target.
- Questions are short, neutral, open-ended ("What…", "How…", "Why…"). They
  are NOT statements. They do NOT presuppose a side.
- Use the canonical claim ids you receive verbatim. Do not invent claims.
- Question ids are "q1", "q2", … in order.

INPUT: canonical claims follow the "CLAIMS:" line below.

OUTPUT (return ONLY this JSON, no prose, no markdown fences):
{"central_questions":[{"id":"q1","question":"…","claim_ids":["c1","c3"]}]}`;

export const PROMPT_STAGE_4_RELATE = ({
  relationshipPalette,
}: {
  relationshipPalette: string[];
}) => `You are inferring relationships between claims and the momentum lens.

GOAL: Produce three things:
1. Within-question relationships — how the claims attached to a single question
   relate to each other (free-form, NOT pro/con). Each relationship carries
   BOTH a palette label (the KIND) and a one-sentence note (the SPECIFIC WAY
   this relationship holds in this case).
2. Across-question relationships — how claims under one question relate to
   claims under another. Note any nodes that appear in multiple questions
   (shared claims).
3. Momentum — the highest-leverage question (the one whose resolution would
   most move the conversation forward) and any latent agreements (claims
   different sides seem to share even when framing diverges).

RELATIONSHIP PALETTE (use these labels when they fit):
${relationshipPalette.map((p) => `  - ${p}`).join("\n")}

If nothing in the palette fits, coin a short label (single hyphenated word). Do
not force a bad palette match. Never use pro/con / for/against / supports-side.

WRITING THE NOTE (this is the load-bearing instruction — do not skip):
- Every within-question relationship MUST carry a "note" that explains HOW
  this relationship manifests in this specific case. The palette label is the
  category; the note is the texture.
- One sentence, ≤25 words. Reference the actual content of the two claims —
  don't restate the label.
- Bad: "supports" + note "c1 supports c2."  ← restates the label, useless.
- Good: "supports" + note "c1 provides the empirical baseline that c2 generalizes
  to a broader population."
- Good: "challenges" + note "c2's framing of consent presupposes the volition
  c1 denies actually exists in the participants."
- Good: "qualifies" + note "c2 holds only in the small-group setting c1
  describes; the original claim was unbounded."
- If you cannot write a meaningful note, the relationship probably shouldn't
  exist. Drop it.

HARD RULES:
- Every "from"/"to" must be a canonical claim id from the input. Every
  "question_id" must be a question id from the input.
- Every within-question relationship MUST have a "note" (see above).
- "cross_question_relationships[].note" also follows the WRITING THE NOTE rule
  — explain how the cross-link manifests, don't restate the label.
- "cross_question_relationships[].shared_claim_ids" lists claim ids that
  appear in BOTH the "from" and "to" question groups (i.e., shared nodes).
- "momentum.highest_leverage_question" is one question id.
- "momentum.latent_agreements[].claim_ids" lists claim ids that, taken
  together, suggest underlying agreement across what looks like disagreement.

INPUT: claims + central_questions follow the "INPUT:" line below.

OUTPUT (return ONLY this JSON, no prose, no markdown fences):
{
  "relationships": [{"from":"c1","to":"c2","type":"supports","note":"…","question_id":"q1"}],
  "cross_question_relationships": [{"from":"q1","to":"q2","type":"depends-on","note":"…","shared_claim_ids":["c3"]}],
  "momentum": {
    "highest_leverage_question": "q1",
    "rationale": "…",
    "latent_agreements": [{"claim_ids":["c2","c5"],"note":"…"}]
  }
}`;

export const PROMPT_FACT_CHECK = () => `You are the fact-check side layer.

GOAL: Read the final canonical claims and produce a list of empirical
checkable items that a human researcher could verify. This layer DOES NOT
modify the map. Truth judgments do not belong in the spine of the argument
map — they live here as todos.

HARD RULES:
- Only select claims that are empirically checkable. Skip opinions,
  normative claims, predictions, and rhetorical questions.
- For each, write a one-sentence "what to check" — the operative datum that
  would confirm or refute the claim.
- Use the canonical claim ids verbatim.

INPUT: canonical claims follow the "CLAIMS:" line below.

OUTPUT (return ONLY this JSON, no prose, no markdown fences):
{"fact_check_todos":[{"claim_id":"c1","claim_text":"…","what_to_check":"…"}]}`;

export const PROMPT_STAGE_5_QUOTES = () => `You are finding verbatim quotes that support canonical claims from a labeled discussion transcript.

GOAL: For each canonical claim, find 2–3 short verbatim excerpts from the transcript that most directly express or support that claim. These quotes appear in a side panel so readers can verify where an idea came from.

TRANSCRIPT FORMAT: Each line is "[Speaker X HH:MM]: utterance text". The speaker label (A, B, C, …) is the identifier to capture.

HARD RULES:
- Quotes MUST be verbatim — copy the exact words from the transcript, no paraphrasing.
- Each quote is SHORT: 1–3 sentences, at a natural sentence boundary.
- Capture the speaker label exactly as it appears (just the letter, e.g. "A", "B", "E").
- If fewer than 2 quotes exist for a claim, include what you find (1 is fine, 0 means skip that claim).
- Prefer quotes where the speaker most directly and clearly expresses the claim.
- Do NOT include meta-commentary ("I think", "as I said") fragments; quotes should be self-contained.
- Use the canonical claim IDs verbatim.

INPUT: canonical claims and the full transcript follow the "INPUT:" line below.

OUTPUT (return ONLY this JSON, no prose, no markdown fences):
{"claim_quotes":[{"claim_id":"c1","quotes":[{"speaker":"A","text":"…"},{"speaker":"E","text":"…"}]}]}`;

// -----------------------------------------------------------------------------
// Pipeline output types — the intermediate shape produced by stages 1-4 + the
// fact-check side layer. `lib/ai/mapToArgMap.ts` maps this to an `ArgMap`.
// -----------------------------------------------------------------------------

export type RawClaim = { text: string };
export type DistilledClaim = {
  id: string;
  text: string;
  is_factual: boolean;
  absorbed: string[];
};
export type CentralQuestion = {
  id: string;
  question: string;
  claim_ids: string[];
};
export type Relationship = {
  from: string;
  to: string;
  type: string;
  // Concrete explanation of how this specific relationship holds. The palette
  // label gives the kind ("supports"); the note tells the reader the texture
  // ("by providing the empirical grounding c2 generalizes from"). Required —
  // the whole point of the rewrite. See PROMPT_STAGE_4_RELATE.
  note: string;
  question_id: string;
};
export type CrossQuestionRelationship = {
  from: string;
  to: string;
  type: string;
  note: string;
  shared_claim_ids: string[];
};
export type MomentumLens = {
  highest_leverage_question: string;
  rationale: string;
  latent_agreements: { claim_ids: string[]; note: string }[];
};
export type FactCheckTodoRaw = {
  claim_id: string;
  claim_text: string;
  what_to_check: string;
};

export type ClaimQuote = { speaker: string; text: string };
export type ClaimQuoteEntry = { claim_id: string; quotes: ClaimQuote[] };

export type Intermediates = {
  rawClaims: RawClaim[];
  distilled: { claims: DistilledClaim[] };
  questions: { central_questions: CentralQuestion[] };
  relations: {
    relationships: Relationship[];
    cross_question_relationships: CrossQuestionRelationship[];
    momentum: MomentumLens;
  };
  factCheck: { fact_check_todos: FactCheckTodoRaw[] };
  quotes: { claim_quotes: ClaimQuoteEntry[] };
};

export type PipelineOutput = {
  claims: DistilledClaim[];
  central_questions: CentralQuestion[];
  relationships: Relationship[];
  cross_question_relationships: CrossQuestionRelationship[];
  momentum: MomentumLens;
  fact_check_todos: FactCheckTodoRaw[];
  claim_quotes: ClaimQuoteEntry[];
};

// -----------------------------------------------------------------------------
// Stage runners. Each is a thin wrapper around generateText + tolerantJsonParse
// so that the workflow layer can call them as individual steps and persist the
// intermediate JSON to blob between stages.
//
// Each runner returns `{ result, usage }`. The workflow layer accumulates
// usage onto the run row so the admin page can show a running cost tally.
//
// Anthropic provider IDs use hyphens (matches Anthropic's API). If we route
// through the Vercel AI Gateway later, swap to `gateway("anthropic/...")`.
// -----------------------------------------------------------------------------

export type StageResult<T> = { result: T; usage: StageUsage };

function providerOptionsFor(params: PipelineParams) {
  // Anthropic's `effort` provider option controls extended-thinking budget on
  // models that support it. Skip when "none" so non-thinking calls don't carry
  // an unused field.
  if (params.effort === "none") return undefined;
  return { anthropic: { effort: params.effort } } as const;
}

// Stage 1 fires many calls in parallel; bursts of 429 / overloaded_error
// responses are expected. We retry up to `MAX_BACKOFF_RETRIES` times with
// exponential backoff (honoring `retry-after` when Anthropic sends it). All
// other errors bubble up unchanged.
const MAX_BACKOFF_RETRIES = 6;

function isRateLimitError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as {
    statusCode?: number;
    status?: number;
    code?: string;
    message?: string;
    data?: { error?: { type?: string } };
  };
  const code = err.statusCode ?? err.status;
  if (code === 429 || code === 529) return true;
  const msg = (err.message ?? "").toLowerCase();
  if (
    msg.includes("rate_limit") ||
    msg.includes("rate limit") ||
    msg.includes("overloaded") ||
    msg.includes("too many requests")
  ) {
    return true;
  }
  const t = err.data?.error?.type;
  return t === "rate_limit_error" || t === "overloaded_error";
}

function backoffDelayMs(e: unknown, attempt: number): number {
  // Honor Anthropic's retry-after header when present.
  const err = e as {
    responseHeaders?: Record<string, string>;
    headers?: Record<string, string>;
  };
  const headers = err.responseHeaders ?? err.headers ?? {};
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  const ra = raw ? Number(raw) : NaN;
  if (Number.isFinite(ra) && ra > 0) return Math.min(60_000, ra * 1000);
  // Exponential backoff with jitter: ~1s, 2s, 4s, 8s, 16s, 30s (capped).
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  return base + Math.floor(Math.random() * 500);
}

// Our ModelId display format uses dots (e.g. claude-sonnet-4.6) but the
// Anthropic REST API requires dot-separators in version numbers to be replaced
// with the character at code point 45. Convert only at this call boundary.
function toApiModelId(id: ModelId): string {
  return id.replace(/\./g, String.fromCharCode(45));
}

export async function callModel(
  prompt: string,
  input: string,
  params: PipelineParams,
): Promise<{ text: string; usage: StageUsage }> {
  let attempt = 0;
  while (true) {
    try {
      const res = await generateText({
        model: anthropic(toApiModelId(params.model)),
        prompt: `${prompt}\n\n${input}`,
        providerOptions: providerOptionsFor(params),
      });
      const u: StageUsage = {
        inputTokens: res.usage.inputTokens ?? 0,
        outputTokens: res.usage.outputTokens ?? 0,
        reasoningTokens: res.usage.reasoningTokens ?? 0,
        cachedInputTokens: res.usage.cachedInputTokens ?? 0,
      };
      return { text: res.text, usage: u };
    } catch (e) {
      if (!isRateLimitError(e) || attempt >= MAX_BACKOFF_RETRIES) throw e;
      const wait = backoffDelayMs(e, attempt);
      attempt += 1;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// Bounded-concurrency map. We avoid a dep and roll a tiny worker pool so the
// workflow bundle stays small. Order of results matches `items`.
async function pMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

// Tunable: how many Stage 1 chunks may be in-flight at once. 10 keeps long
// transcripts under Anthropic's per-minute caps in practice; bump if you have
// a higher tier.
export const STAGE_1_CHUNK_CONCURRENCY = 10;

export async function callJson<T>(
  prompt: string,
  input: string,
  params: PipelineParams,
): Promise<{ parsed: T; usage: StageUsage }> {
  const first = await callModel(prompt, input, params);
  try {
    const parsed = await tolerantJsonParse<T>(first.text);
    return { parsed, usage: first.usage };
  } catch {
    // Retry once with the "return only JSON" reminder. Accumulate both calls'
    // usage so the cost tally tells the truth.
    const retry = await callModel(
      `${prompt}\n\nREMINDER: Return ONLY the JSON object specified. No prose, no markdown fences.`,
      input,
      params,
    );
    const parsed = await tolerantJsonParse<T>(retry.text);
    const usage: StageUsage = {
      inputTokens: first.usage.inputTokens + retry.usage.inputTokens,
      outputTokens: first.usage.outputTokens + retry.usage.outputTokens,
      reasoningTokens:
        first.usage.reasoningTokens + retry.usage.reasoningTokens,
      cachedInputTokens:
        first.usage.cachedInputTokens + retry.usage.cachedInputTokens,
    };
    return { parsed, usage };
  }
}

export type ProgressFn = (
  message: string,
  meta?: { chunkIndex?: number; chunkCount?: number },
) => Promise<void> | void;

export async function stage1Extract(
  transcript: string,
  params: PipelineParams,
  onProgress?: ProgressFn,
): Promise<StageResult<RawClaim[]>> {
  const chunks = chunkTranscript(transcript);
  if (onProgress) {
    await onProgress(
      chunks.length === 1
        ? "transcript fits in one chunk"
        : `split transcript into ${chunks.length} chunks · running up to ${STAGE_1_CHUNK_CONCURRENCY} in parallel`,
      { chunkCount: chunks.length },
    );
  }

  let completed = 0;
  const results = await pMap(chunks, STAGE_1_CHUNK_CONCURRENCY, async (chunk, i) => {
    if (onProgress) {
      await onProgress(`chunk ${i + 1}/${chunks.length} starting`, {
        chunkIndex: i,
        chunkCount: chunks.length,
      });
    }
    const prompt = PROMPT_STAGE_1_EXTRACT({
      granularity: params.granularity,
      chunkIndex: i,
      chunkCount: chunks.length,
    });
    const { parsed, usage } = await callJson<{ claims: RawClaim[] }>(
      prompt,
      `TRANSCRIPT:\n${chunk}`,
      params,
    );
    const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
    completed += 1;
    if (onProgress) {
      await onProgress(
        `chunk ${i + 1}/${chunks.length} done · ${claims.length} claims · ${completed}/${chunks.length} chunks complete`,
        { chunkIndex: i, chunkCount: chunks.length },
      );
    }
    return { claims, usage };
  });

  const all: RawClaim[] = [];
  let usage = emptyUsage();
  for (const r of results) {
    all.push(...r.claims);
    usage = {
      inputTokens: usage.inputTokens + r.usage.inputTokens,
      outputTokens: usage.outputTokens + r.usage.outputTokens,
      reasoningTokens: usage.reasoningTokens + r.usage.reasoningTokens,
      cachedInputTokens: usage.cachedInputTokens + r.usage.cachedInputTokens,
    };
  }
  return { result: all, usage };
}

// Above this raw-claim count we chunk Stage 2 instead of one giant call. A
// single 1000+ claim distill call routinely hits the 800s Vercel function
// timeout — and even when it fits, dedup quality drops because the model
// can't hold that many items in working memory at once.
export const STAGE_2_BATCH_SIZE = 250;

export async function stage2Distill(
  rawClaims: RawClaim[],
  params: PipelineParams,
  onProgress?: ProgressFn,
): Promise<StageResult<{ claims: DistilledClaim[] }>> {
  const prompt = PROMPT_STAGE_2_DISTILL({ dedupLevel: params.dedupLevel });

  // Small input — one shot, original path.
  if (rawClaims.length <= STAGE_2_BATCH_SIZE) {
    const input = `RAW CLAIMS:\n${JSON.stringify(rawClaims, null, 2)}`;
    const { parsed, usage } = await callJson<{ claims: DistilledClaim[] }>(
      prompt,
      input,
      params,
    );
    return { result: parsed, usage };
  }

  // Big input — chunk, distill each batch in parallel, then run a final
  // merge-distill over all the partial canonical claims.
  const batches: RawClaim[][] = [];
  for (let i = 0; i < rawClaims.length; i += STAGE_2_BATCH_SIZE) {
    batches.push(rawClaims.slice(i, i + STAGE_2_BATCH_SIZE));
  }
  if (onProgress) {
    await onProgress(
      `distilling ${rawClaims.length} raw claims in ${batches.length} batches of ~${STAGE_2_BATCH_SIZE}`,
    );
  }

  let completed = 0;
  const partials = await pMap(batches, STAGE_1_CHUNK_CONCURRENCY, async (batch, i) => {
    if (onProgress) {
      await onProgress(`distill batch ${i + 1}/${batches.length} starting (${batch.length} claims)`);
    }
    const input = `RAW CLAIMS:\n${JSON.stringify(batch, null, 2)}`;
    const { parsed, usage } = await callJson<{ claims: DistilledClaim[] }>(
      prompt,
      input,
      params,
    );
    const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
    completed += 1;
    if (onProgress) {
      await onProgress(
        `distill batch ${i + 1}/${batches.length} done · ${claims.length} canonical · ${completed}/${batches.length} batches complete`,
      );
    }
    return { claims, usage };
  });

  // Collapse each partial canonical claim back into a RawClaim shape and run
  // one more distill pass over the whole set. This is the cross-batch dedup
  // pass — without it, near-duplicates split across batches would slip through.
  // The "absorbed" arrays from the partial passes are preserved by feeding
  // them in as part of the text payload so the merge can stitch chains.
  const mergeInput: RawClaim[] = partials.flatMap((p) =>
    p.claims.map((c) => ({ text: c.text })),
  );
  if (onProgress) {
    await onProgress(
      `merging ${mergeInput.length} partial canonical claims into final set`,
    );
  }
  const { parsed: merged, usage: mergeUsage } = await callJson<{
    claims: DistilledClaim[];
  }>(prompt, `RAW CLAIMS:\n${JSON.stringify(mergeInput, null, 2)}`, params);

  // Sum usage across all calls.
  let usage = emptyUsage();
  for (const p of partials) {
    usage = {
      inputTokens: usage.inputTokens + p.usage.inputTokens,
      outputTokens: usage.outputTokens + p.usage.outputTokens,
      reasoningTokens: usage.reasoningTokens + p.usage.reasoningTokens,
      cachedInputTokens: usage.cachedInputTokens + p.usage.cachedInputTokens,
    };
  }
  usage = {
    inputTokens: usage.inputTokens + mergeUsage.inputTokens,
    outputTokens: usage.outputTokens + mergeUsage.outputTokens,
    reasoningTokens: usage.reasoningTokens + mergeUsage.reasoningTokens,
    cachedInputTokens: usage.cachedInputTokens + mergeUsage.cachedInputTokens,
  };

  if (onProgress) {
    await onProgress(`merge complete · ${merged.claims?.length ?? 0} canonical claims final`);
  }
  return { result: merged, usage };
}

export async function stage3Organize(
  distilled: { claims: DistilledClaim[] },
  params: PipelineParams,
): Promise<StageResult<{ central_questions: CentralQuestion[] }>> {
  const prompt = PROMPT_STAGE_3_ORGANIZE({ nQuestions: params.nQuestions });
  const input = `CLAIMS:\n${JSON.stringify(distilled.claims, null, 2)}`;
  const { parsed, usage } = await callJson<{
    central_questions: CentralQuestion[];
  }>(prompt, input, params);
  return { result: parsed, usage };
}

export async function stage4Relate(
  distilled: { claims: DistilledClaim[] },
  questions: { central_questions: CentralQuestion[] },
  params: PipelineParams,
): Promise<
  StageResult<{
    relationships: Relationship[];
    cross_question_relationships: CrossQuestionRelationship[];
    momentum: MomentumLens;
  }>
> {
  const prompt = PROMPT_STAGE_4_RELATE({
    relationshipPalette: params.relationshipPalette,
  });
  const input = `INPUT:\n${JSON.stringify(
    {
      claims: distilled.claims,
      central_questions: questions.central_questions,
    },
    null,
    2,
  )}`;
  const { parsed, usage } = await callJson<{
    relationships: Relationship[];
    cross_question_relationships: CrossQuestionRelationship[];
    momentum: MomentumLens;
  }>(prompt, input, params);
  return { result: parsed, usage };
}

export async function factCheckSideLayer(
  distilled: { claims: DistilledClaim[] },
  params: PipelineParams,
): Promise<StageResult<{ fact_check_todos: FactCheckTodoRaw[] }>> {
  const prompt = PROMPT_FACT_CHECK();
  const input = `CLAIMS:\n${JSON.stringify(distilled.claims, null, 2)}`;
  const { parsed, usage } = await callJson<{
    fact_check_todos: FactCheckTodoRaw[];
  }>(prompt, input, params);
  return { result: parsed, usage };
}

// Stage 5 — quote retrieval. Runs after Stage 2 (distill) and takes the full
// labeled transcript so it can return verbatim speaker-attributed excerpts.
// The transcript is ~40–50K tokens for a 3-hour session — well within Sonnet's
// 200K context window. One call; no chunking needed.
export async function stage5Quotes(
  distilled: { claims: DistilledClaim[] },
  transcript: string,
  params: PipelineParams,
): Promise<StageResult<{ claim_quotes: ClaimQuoteEntry[] }>> {
  const prompt = PROMPT_STAGE_5_QUOTES();
  const claimList = distilled.claims.map((c) => ({ id: c.id, text: c.text }));
  const input = `INPUT:\n\nCANONICAL CLAIMS:\n${JSON.stringify(claimList, null, 2)}\n\nTRANSCRIPT:\n${transcript}`;
  const { parsed, usage } = await callJson<{
    claim_quotes: ClaimQuoteEntry[];
  }>(prompt, input, params);
  return { result: parsed, usage };
}

// Convenience: run the whole pipeline in-process. The workflow layer normally
// calls the individual stages so each result can be persisted and re-run from.
// This export exists for tests / scripts.
export async function generateMap(input: {
  transcript: string;
  params?: Partial<PipelineParams>;
}): Promise<{ output: PipelineOutput; intermediates: Intermediates }> {
  const params: PipelineParams = { ...DEFAULT_PARAMS, ...(input.params ?? {}) };
  const rawClaims = await stage1Extract(input.transcript, params);
  const distilled = await stage2Distill(rawClaims.result, params);
  const questions = await stage3Organize(distilled.result, params);
  const relations = await stage4Relate(distilled.result, questions.result, params);
  const [factCheck, quotesResult] = await Promise.all([
    factCheckSideLayer(distilled.result, params),
    stage5Quotes(distilled.result, input.transcript, params),
  ]);

  const output: PipelineOutput = {
    claims: distilled.result.claims,
    central_questions: questions.result.central_questions,
    relationships: relations.result.relationships,
    cross_question_relationships:
      relations.result.cross_question_relationships,
    momentum: relations.result.momentum,
    fact_check_todos: factCheck.result.fact_check_todos,
    claim_quotes: quotesResult.result.claim_quotes ?? [],
  };
  return {
    output,
    intermediates: {
      rawClaims: rawClaims.result,
      distilled: distilled.result,
      questions: questions.result,
      relations: relations.result,
      factCheck: factCheck.result,
      quotes: quotesResult.result,
    },
  };
}
