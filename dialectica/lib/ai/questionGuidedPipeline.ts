import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { tolerantJsonParse } from "./jsonParse";
import { emptyUsage, type StageUsage } from "./pricing";
import {
  DEFAULT_PARAMS,
  type PipelineParams,
  type DistilledClaim,
  type CentralQuestion,
  type Relationship,
  type CrossQuestionRelationship,
  type MomentumLens,
  type FactCheckTodoRaw,
  type PipelineOutput,
  type StageResult,
} from "./pipeline";

// =============================================================================
// Question-guided pipeline (Phase 7, second sensemaking option).
//
// Free-form pipeline distills bottom-up: extract every raw claim → dedup →
// infer central questions → relate. This pipeline goes top-down instead: the
// curator picks the central questions up front (with LLM-proposed candidates),
// and for each one we pull 4-5 claims directly from the transcript, then draw
// connections WITH the transcript in context so the notes carry the specific
// texture of how each relationship actually manifests.
//
// Same PipelineOutput shape on the way out, so mapToArgMap / the admin run
// page / the canvas all work unchanged.
// =============================================================================

// How many sub-questions to propose. Curators see all of them and pick / edit.
export const PROPOSE_QUESTION_COUNT_DEFAULT = 8;

// How many claims per question. The user spec says "4-5 claims per topic"
// — we ask for 4-5 in the prompt and accept whatever the model returns within
// that bracket.
export const CLAIMS_PER_QUESTION_TARGET = 5;

// -----------------------------------------------------------------------------
// PROMPTS — all five live here as editable string constants. Same convention
// as `lib/ai/pipeline.ts`. Tune wording here, not in helper files.
// -----------------------------------------------------------------------------

export const PROMPT_PROPOSE_QUESTIONS = ({
  topQuestion,
  target,
}: {
  topQuestion: string;
  target: number;
}) =>`You are proposing the central sub-questions of a discussion.

INPUT: a top-level question the participants were trying to answer, and the
full transcript of the discussion. Your job: read the transcript and surface
the ${target} biggest sub-questions the participants actually wrestled with
under the top-level question. The curator will review your list and pick / edit
which ones become the cruxes of the argument map.

TOP-LEVEL QUESTION: ${topQuestion}

WHAT MAKES A GOOD SUB-QUESTION:
- A live tension, not a topic. Find the axis the room actually split on — where
  thoughtful people in the transcript gave genuinely different answers. The best
  sub-questions have an implicit "versus" inside them (X or Y? strengthens or
  erodes? this role or that one?).
- Anchored in the ARGUMENT, not just the vocabulary. The connection to the
  top-level question need not be literal or direct — a question can avoid the
  words "team" or "future" entirely and still be the crux. What matters is that
  resolving it changes the answer to the top-level question.
- Open-ended. Start with "What / How / Why / When / Whether", OR frame it
  conditionally: "If [something the transcript treats as true or likely], then
  what…". Never a yes/no.
- Neutral. Does NOT presuppose which side is right. Multiple positions voiced in
  the room can plausibly answer it.
- Substantive and recurring. Something the conversation kept circling back to —
  not a passing remark.
- Distinct. Two sub-questions that boil down to the same crux should be one.
- Easy to understand on first read.
- Tied to a decision or action if answered well, whichever side one lands on.

HARD RULES:
- Return ${target} sub-questions (you may emit ${Math.max(3, target - 2)}-${target + 2}
  if the material genuinely supports fewer or more — bias toward the target).
- Plain question strings. No numbering. No commentary. No speaker names.
- Short — under ~18 words per question.

INPUT: the transcript follows the "TRANSCRIPT:" line below.

OUTPUT (return ONLY this JSON, no prose, no markdown fences):
{"questions":["…","…"]}`;

export const PROMPT_EXTRACT_CLAIMS_FOR_QUESTION = ({
  subQuestion,
  target,
}: {
  subQuestion: string;
  target: number;
}) => `You are pulling the ${target} most important claims that bear on one
sub-question, FROM the transcript provided.

SUB-QUESTION: ${subQuestion}

WHAT A "CLAIM" IS HERE:
- A standalone, free-form assertion that appears (or is strongly implied) in
  the transcript and that bears on the sub-question.
- A claim is just a position a participant took. Claims can be in conflict with one another, the goal is to have a general representation of the argument at hand.
- De-personalized — strip "I think", "she said", quotes, timestamps. The
  CLAIM is what survives the speaker.
- Distinct from the other claims for this question. If two utterances boil
  down to the same assertion, ONE claim covers both.
- Every claim should be reasonable: for example: "Return-to-office mandates, tracking, and policies suck the joy out of an inherently good experience" is not reasonable, because no one reasonable would call it inherently good. Return-to-office mandates, tracking, and policies suck the joy out of the experience.

CALIBRATION:
- Target ${target}. Emit 4-5 if the material supports it. Emit fewer (3) only
  when there genuinely aren't more distinct positions in the transcript.
- These should be the load-bearing claims — the ones the conversation actually
  pivoted on, not asides.
- Claims on the map should potentially be in contradiction with one another, showing the different sides of the argument. All claims should be the best version of their argument.

OPTIONAL FLAGS:
- "is_factual": true ONLY for claims that are empirically checkable (a number,
  a date, a verifiable fact about the world). Opinions, predictions, and
  normative claims = false.

HARD RULES:
- Use the canonical claim id "c1", "c2", … in order. (The pipeline will
  re-namespace these per-question downstream — your job is just to enumerate.)
- Anchor every claim in the transcript. Do NOT invent positions no one took.
- Keep claims short — ideally under 15 words each.

INPUT: the transcript follows the "TRANSCRIPT:" line below.

OUTPUT (return ONLY this JSON, no prose, no markdown fences):
{"claims":[{"id":"c1","text":"…","is_factual":false}]}`;

export const PROMPT_RELATE_WITHIN_QUESTION = ({
  subQuestion,
}: {
  subQuestion: string;
}) => `You are drawing the connections between the claims for one sub-question.

SUB-QUESTION: ${subQuestion}

GOAL: produce the connections that weave these claims into a coherent
narrative — the kind of analysis where each connection earns its place by
saying something specific about HOW one claim acts on another, not just
that they relate.

You have THREE things below:
1. The transcript (so you can ground each connection in what was actually said).
2. The sub-question.
3. The claims under it.

NO CATEGORY LABELS:
- Do NOT classify connections into a fixed vocabulary like "supports /
  challenges / qualifies / reframes / depends-on / raises".
- Do NOT use "agrees", "disagrees", "is in tension with", "for", "against",
  or anything that just restates that two claims are related.
- Each connection has ONE field: a short verb phrase that names the actual
  move from "from" to "to".

THE LABEL — THIS IS THE WHOLE POINT:
- Each "label" is a short verb phrase describing what FROM does TO TO.
- Hard length cap: 10 words MAXIMUM. Most should be ~4 words.
- The label should make sense read on its own: "(from) <label> (to)".
- Reference the substance of the move, not just the existence of the relation.
- Concrete, active, specific. If you cannot write a label that earns its
  edge, drop the connection. 3 sharp connections beat 6 flat ones.
- please create 3-4 labels in total

BAD (do not produce these):
- "agrees" ← restates that the claims are related, not how
- "disagrees" ← same problem
- "in tension with" ← flat, no substance
- "supports the idea that" ← category-flavored filler
- "is related to" ← contentless

GOOD (this is the bar — short, active, specific):
- "Gives explanation to"             (3 words)
- "Contests the significance of"     (4 words)
- "Shifts responsibility from tool to user"   (6 words)
- "Reframes question from 'what' to 'how'"    (6 words)
- "Provides empirical baseline for"   (4 words)

The third and fourth examples are the target — labels that move the
argument forward, not just classify it.

NARRATIVE COHERENCE:
- The set of connections should read as a small story, not a flat list. When
  you have flexibility in how to phrase a label, prefer the framing that
  makes the next connection feel like it follows.

HARD RULES:
- Every "from"/"to" must be one of the claim ids you receive.
- Every connection has a "label". MAX 10 words. Aim for ~4.
- "question_id" is the id of this question (provided in INPUT).
- Don't force connections that don't exist.

INPUT: transcript + sub-question + claims follow below.

OUTPUT (return ONLY this JSON, no prose, no markdown fences):
{"relationships":[{"from":"c1","to":"c2","label":"Gives explanation to","question_id":"q1"}]}`;

// Cross-question stitching. We pass the transcript along so connections
// between questions are grounded in what was actually said — same standard
// as the within-question pass. Style matches the within-question prompt:
// short verb phrases, no palette, narrative-driving.
export const PROMPT_RELATE_CROSS_QUESTION =
  () => `You are drawing the connections BETWEEN the sub-questions (cruxes) of
an argument map. These edges sit on the top-level "crux view" and weave the
sub-questions into a coherent through-line.

You have THREE things below:
1. The transcript (so each connection is grounded in what was actually said).
2. The central questions (cruxes), each with an id.
3. The full list of claims, namespaced by question.

GOAL: surface 6-7 the connections that turn the cruxes from a flat list into a
small story — where one sub-question's framing pre-supposes another, where
resolving one would unlock another, where one reframes the territory the
other is operating on.

NO CATEGORY LABELS:
- Do NOT use a fixed palette ("supports", "depends-on", "challenges",
  "reframes", etc.).
- Each connection has ONE field: a short verb phrase that names the actual
  move from "from" to "to".

THE LABEL — same standard as within-question connections:
- Short verb phrase. Hard cap 10 words. Most should be ~4 words.
- Reads naturally as "(from question) <label> (to question)".
- Concrete, active, specific. Drop the connection if you can't earn a label.

BAD (do not produce these):
- "is related to"          ← contentless
- "depends on"             ← palette-flavored filler
- "agrees with"            ← flat
- "supports the claim of"  ← restates that they're related, not how

GOOD (this is the bar):
- "Hinges on resolution of"             (4 words)
- "Reframes scope of"                   (3 words)
- "Pre-supposes answer to"              (3 words)
- "Shifts territory examined by"        (4 words)
- "Renders moot the answer to"          (5 words)

NARRATIVE COHERENCE:
- The set of cross-question connections should read as a small story across
  the cruxes — not a flat list. When you have flexibility, prefer the
  framing that makes the next connection follow.

HARD RULES:
- "from"/"to" are QUESTION ids (q1, q2, …) — NOT claim ids.
- Every connection has a "label" (≤10 words, mostly ~4). Drop empty ones.
- "shared_claim_ids" lists any claim ids that appear in BOTH groups. Often
  empty — that's fine.
- It is FINE to return zero connections if the cruxes are genuinely
  independent. Do not invent them. Quality over coverage.

INPUT: transcript + central_questions + claims follow below.

OUTPUT (return ONLY this JSON, no prose, no markdown fences):
{"cross_question_relationships":[{"from":"q1","to":"q2","label":"Hinges on resolution of","shared_claim_ids":[]}]}`;

// -----------------------------------------------------------------------------
// Stage runners.
// -----------------------------------------------------------------------------

function providerOptionsFor(params: PipelineParams) {
  if (params.effort === "none") return undefined;
  return { anthropic: { effort: params.effort } } as const;
}

// Reuse the rate-limit backoff machinery via small private wrappers — keeping
// these duplicated (rather than exporting from pipeline.ts) avoids a circular
// import and stays under 50 lines.
const MAX_BACKOFF_RETRIES = 6;

function isRateLimitError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as {
    statusCode?: number;
    status?: number;
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
  const err = e as {
    responseHeaders?: Record<string, string>;
    headers?: Record<string, string>;
  };
  const headers = err.responseHeaders ?? err.headers ?? {};
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  const ra = raw ? Number(raw) : NaN;
  if (Number.isFinite(ra) && ra > 0) return Math.min(60_000, ra * 1000);
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  return base + Math.floor(Math.random() * 500);
}

async function callModel(
  prompt: string,
  input: string,
  params: PipelineParams,
): Promise<{ text: string; usage: StageUsage }> {
  let attempt = 0;
  while (true) {
    try {
      const res = await generateText({
        model: anthropic(params.model),
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

async function callJson<T>(
  prompt: string,
  input: string,
  params: PipelineParams,
): Promise<{ parsed: T; usage: StageUsage }> {
  const first = await callModel(prompt, input, params);
  try {
    const parsed = await tolerantJsonParse<T>(first.text);
    return { parsed, usage: first.usage };
  } catch {
    const retry = await callModel(
      `${prompt}\n\nREMINDER: Return ONLY the JSON object specified. No prose, no markdown fences.`,
      input,
      params,
    );
    const parsed = await tolerantJsonParse<T>(retry.text);
    return {
      parsed,
      usage: {
        inputTokens: first.usage.inputTokens + retry.usage.inputTokens,
        outputTokens: first.usage.outputTokens + retry.usage.outputTokens,
        reasoningTokens:
          first.usage.reasoningTokens + retry.usage.reasoningTokens,
        cachedInputTokens:
          first.usage.cachedInputTokens + retry.usage.cachedInputTokens,
      },
    };
  }
}

// -----------------------------------------------------------------------------
// Stage 0 — propose candidate sub-questions for curator review.
// Called synchronously from /api/generations/propose-questions BEFORE the
// workflow row is created. No blob persistence, no usage tracking — this is a
// cheap interactive step.
// -----------------------------------------------------------------------------
export async function proposeSubQuestions(args: {
  transcript: string;
  topQuestion: string;
  params?: Partial<PipelineParams>;
  target?: number;
}): Promise<{ questions: string[]; usage: StageUsage }> {
  const params: PipelineParams = { ...DEFAULT_PARAMS, ...(args.params ?? {}) };
  const target = args.target ?? PROPOSE_QUESTION_COUNT_DEFAULT;
  const prompt = PROMPT_PROPOSE_QUESTIONS({
    topQuestion: args.topQuestion,
    target,
  });
  const { parsed, usage } = await callJson<{ questions: string[] }>(
    prompt,
    `TRANSCRIPT:\n${args.transcript}`,
    params,
  );
  const questions = Array.isArray(parsed.questions)
    ? parsed.questions.map((q) => String(q).trim()).filter(Boolean)
    : [];
  return { questions, usage };
}

// -----------------------------------------------------------------------------
// Stage 1 (question-guided) — for each curator-selected sub-question, pull
// 4-5 claims FROM THE TRANSCRIPT that bear on it.
//
// IDs are namespaced per-question (q1c1, q1c2, …) so claims from different
// questions don't collide. The model's internal "c1, c2, …" labels are
// rewritten on receipt — keeps the prompt simple and the output collision-free.
// -----------------------------------------------------------------------------

export type QuestionWithClaims = {
  questionId: string;
  question: string;
  claims: DistilledClaim[]; // shape-compatible with the free-form pipeline
};

export type ProgressFn = (
  message: string,
  meta?: { questionIndex?: number; questionCount?: number },
) => Promise<void> | void;

// Concurrency cap for parallel per-question stages. Same default as the
// free-form pipeline's chunk concurrency.
export const QUESTION_CONCURRENCY = 5;

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

export async function stage1ExtractClaimsByQuestion(
  transcript: string,
  subQuestions: string[],
  params: PipelineParams,
  onProgress?: ProgressFn,
): Promise<StageResult<QuestionWithClaims[]>> {
  if (onProgress) {
    await onProgress(
      `extracting claims for ${subQuestions.length} sub-questions · up to ${QUESTION_CONCURRENCY} in parallel`,
      { questionCount: subQuestions.length },
    );
  }

  let completed = 0;
  const results = await pMap(
    subQuestions,
    QUESTION_CONCURRENCY,
    async (subQuestion, i) => {
      const questionId = `q${i + 1}`;
      if (onProgress) {
        await onProgress(`extracting for ${questionId}: "${subQuestion}"`, {
          questionIndex: i,
          questionCount: subQuestions.length,
        });
      }
      const prompt = PROMPT_EXTRACT_CLAIMS_FOR_QUESTION({
        subQuestion,
        target: CLAIMS_PER_QUESTION_TARGET,
      });
      const { parsed, usage } = await callJson<{
        claims: { id?: string; text: string; is_factual?: boolean }[];
      }>(prompt, `TRANSCRIPT:\n${transcript}`, params);

      const claims: DistilledClaim[] = (parsed.claims ?? []).map((c, ci) => ({
        id: `${questionId}c${ci + 1}`,
        text: String(c.text ?? "").trim(),
        is_factual: Boolean(c.is_factual),
        // No dedup step in this pipeline, so absorbed is empty — leaves the
        // run-detail page's "absorbed" UI inert, which is fine.
        absorbed: [],
      }));

      completed += 1;
      if (onProgress) {
        await onProgress(
          `${questionId} done · ${claims.length} claims · ${completed}/${subQuestions.length} questions complete`,
          { questionIndex: i, questionCount: subQuestions.length },
        );
      }
      return { entry: { questionId, question: subQuestion, claims }, usage };
    },
  );

  const entries = results.map((r) => r.entry);
  let usage = emptyUsage();
  for (const r of results) {
    usage = {
      inputTokens: usage.inputTokens + r.usage.inputTokens,
      outputTokens: usage.outputTokens + r.usage.outputTokens,
      reasoningTokens: usage.reasoningTokens + r.usage.reasoningTokens,
      cachedInputTokens: usage.cachedInputTokens + r.usage.cachedInputTokens,
    };
  }
  return { result: entries, usage };
}

// -----------------------------------------------------------------------------
// Stage 2 (question-guided) — for each question's claims, draw connections.
// Critical: pass the transcript along so the model can ground each note in
// what was actually said. The prompt's whole purpose is forcing notes that
// say HOW the connection manifests, not just THAT it does.
// -----------------------------------------------------------------------------

export async function stage2RelateWithinQuestions(
  transcript: string,
  groups: QuestionWithClaims[],
  params: PipelineParams,
  onProgress?: ProgressFn,
): Promise<StageResult<Relationship[]>> {
  if (onProgress) {
    await onProgress(
      `drawing connections for ${groups.length} sub-questions · up to ${QUESTION_CONCURRENCY} in parallel`,
      { questionCount: groups.length },
    );
  }

  let completed = 0;
  const results = await pMap(groups, QUESTION_CONCURRENCY, async (group, i) => {
    if (onProgress) {
      await onProgress(`relating ${group.questionId}: ${group.claims.length} claims`, {
        questionIndex: i,
        questionCount: groups.length,
      });
    }
    const prompt = PROMPT_RELATE_WITHIN_QUESTION({
      subQuestion: group.question,
      });
    const input = `TRANSCRIPT:\n${transcript}\n\nSUB-QUESTION (id ${group.questionId}): ${group.question}\n\nCLAIMS:\n${JSON.stringify(group.claims, null, 2)}`;
    // New question-guided shape: each connection is just {from, to, label}.
    // No category. No "type" enum. The label IS the connection.
    type LlmRelEdge = { from: string; to: string; label?: string };
    const { parsed, usage } = await callJson<{
      relationships: LlmRelEdge[];
    }>(prompt, input, params);

    const valid = new Set(group.claims.map((c) => c.id));
    // Cap labels at 10 words defensively, even if the prompt was respected.
    const clampWords = (s: string, max: number) => {
      const words = s.trim().split(/\s+/).filter(Boolean);
      return words.length <= max ? words.join(" ") : words.slice(0, max).join(" ");
    };
    // Mapping into the shared Relationship shape: keep `type` empty (no
    // palette) and store the short verb phrase in `note`. mapToArgMap then
    // produces edges with empty relType and the phrase as the edge `label`.
    const relationships: Relationship[] = (parsed.relationships ?? [])
      .filter((r) => valid.has(r.from) && valid.has(r.to))
      .map((r) => ({
        from: r.from,
        to: r.to,
        type: "",
        note: clampWords(String(r.label ?? "").trim(), 10),
        question_id: group.questionId,
      }))
      .filter((r) => r.note.length > 0);

    completed += 1;
    if (onProgress) {
      await onProgress(
        `${group.questionId} relations done · ${relationships.length} connections · ${completed}/${groups.length} complete`,
        { questionIndex: i, questionCount: groups.length },
      );
    }
    return { relationships, usage };
  });

  const all: Relationship[] = [];
  let usage = emptyUsage();
  for (const r of results) {
    all.push(...r.relationships);
    usage = {
      inputTokens: usage.inputTokens + r.usage.inputTokens,
      outputTokens: usage.outputTokens + r.usage.outputTokens,
      reasoningTokens: usage.reasoningTokens + r.usage.reasoningTokens,
      cachedInputTokens: usage.cachedInputTokens + r.usage.cachedInputTokens,
    };
  }
  return { result: all, usage };
}

// Cross-question relationships. Cheap optional pass — the transcript is NOT
// passed in to keep the call small (and across-question links are about the
// shape of the map, not the texture of any one exchange).
export async function stage3RelateCrossQuestions(
  transcript: string,
  groups: QuestionWithClaims[],
  params: PipelineParams,
): Promise<StageResult<CrossQuestionRelationship[]>> {
  const prompt = PROMPT_RELATE_CROSS_QUESTION();
  const allClaims = groups.flatMap((g) => g.claims);
  const central_questions = groups.map((g) => ({
    id: g.questionId,
    question: g.question,
    claim_ids: g.claims.map((c) => c.id),
  }));
  // Pass the transcript so cross-question connections can be grounded the
  // same way the within-question ones are.
  const input = `TRANSCRIPT:\n${transcript}\n\nINPUT:\n${JSON.stringify({ central_questions, claims: allClaims }, null, 2)}`;
  type LlmCrossEdge = {
    from: string;
    to: string;
    label?: string;
    shared_claim_ids?: string[];
  };
  const { parsed, usage } = await callJson<{
    cross_question_relationships: LlmCrossEdge[];
  }>(prompt, input, params);

  const knownQ = new Set(groups.map((g) => g.questionId));
  const knownC = new Set(allClaims.map((c) => c.id));
  const clampWords = (s: string, max: number) => {
    const words = s.trim().split(/\s+/).filter(Boolean);
    return words.length <= max ? words.join(" ") : words.slice(0, max).join(" ");
  };
  const cross: CrossQuestionRelationship[] = (
    parsed.cross_question_relationships ?? []
  )
    .filter((x) => knownQ.has(x.from) && knownQ.has(x.to))
    .map((x) => ({
      from: x.from,
      to: x.to,
      type: "",
      note: clampWords(String(x.label ?? "").trim(), 10),
      shared_claim_ids: Array.isArray(x.shared_claim_ids)
        ? x.shared_claim_ids.filter((id: string) => knownC.has(id))
        : [],
    }))
    .filter((r) => r.note.length > 0);
  return { result: cross, usage };
}

// -----------------------------------------------------------------------------
// Output assembly — fold the per-question results into the same shape
// PipelineOutput uses, so `mapToArgMap` works unchanged.
//
// `momentum` is left in a minimal "no surfaced highlight" state — the
// question-guided flow doesn't infer a highest-leverage question (the curator
// already picked the cruxes deliberately). `fact_check_todos` left empty for
// the same reason; if we want fact-check later we can run the side layer on
// the merged claim list.
// -----------------------------------------------------------------------------
export function assembleQuestionGuidedOutput(
  groups: QuestionWithClaims[],
  withinQuestionRelations: Relationship[],
  crossQuestionRelations: CrossQuestionRelationship[],
  factCheckTodos: FactCheckTodoRaw[] = [],
): PipelineOutput {
  const claims: DistilledClaim[] = groups.flatMap((g) => g.claims);
  const central_questions: CentralQuestion[] = groups.map((g) => ({
    id: g.questionId,
    question: g.question,
    claim_ids: g.claims.map((c) => c.id),
  }));
  const momentum: MomentumLens = {
    highest_leverage_question: groups[0]?.questionId ?? "",
    rationale:
      "Question-guided pipeline: cruxes were curator-selected, not inferred — no highest-leverage signal.",
    latent_agreements: [],
  };
  return {
    claims,
    central_questions,
    relationships: withinQuestionRelations,
    cross_question_relationships: crossQuestionRelations,
    momentum,
    fact_check_todos: factCheckTodos,
  };
}
