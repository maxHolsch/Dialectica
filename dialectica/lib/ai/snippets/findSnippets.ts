import "server-only";
import { callJson, DEFAULT_PARAMS, type PipelineParams } from "../pipeline";
import {
  type StageUsage,
  type ModelId,
  type Effort,
  addUsage,
  emptyUsage,
} from "../pricing";
import type { ClaimSnippet } from "@/lib/schema";
import type { IndexedTranscript } from "./transcript";

// Standalone snippet stage: for each claim, ask the model for the top-N most
// related utterances from the indexed transcript, returned BY ID so we can map
// them to exact audio timestamps. Modeled on stage5Quotes in ../pipeline.ts —
// reuses callJson (retry + tolerant JSON + rate-limit backoff).

// Snippet count is a RANGE: aim for `ideal`, never more than `max`, and only
// dip below `min` when there genuinely aren't that many relevant moments.
export const DEFAULT_SNIPPET_RANGE = { ideal: 5, min: 3, max: 8 } as const;
export type SnippetRange = { ideal: number; min: number; max: number };
// Claims per LLM call. The full indexed transcript (~55K tokens) is re-sent
// each call, so batching amortizes it: ~10 calls for ~150 claims. (Prompt
// caching the transcript block is a future optimization — see ../pipeline.ts.)
export const DEFAULT_BATCH_SIZE = 12;

export type ClaimForSnippets = { id: string; text: string };

const PROMPT_FIND_SNIPPETS = (range: SnippetRange) =>
  `You are finding the transcript moments most related to each claim from a discussion.

GOAL: For EACH claim, select the utterances from the transcript that most directly express, support, motivate, or challenge that claim. These power a "where this came from" drawer with audio playback, so precision matters more than coverage.

HOW MANY (per claim): aim for about ${range.ideal}, return between ${range.min} and ${range.max}. Only return fewer than ${range.min} when there genuinely aren't that many relevant moments — never pad with weak or off-topic matches. Never return more than ${range.max}.

TRANSCRIPT FORMAT: Each line is "[Uxxxx | Speaker Name | H:MM]: utterance text". The "Uxxxx" token is the utterance ID — that is what you return.

HARD RULES:
- Return ONLY utterance IDs that appear verbatim in the transcript (e.g. "U0042"). Never invent IDs.
- Rank MOST related first. Return an empty list if none fit.
- Pick standalone, on-topic moments — prefer where a speaker directly articulates the idea over passing mentions.
- "relevance" is one short clause (≤15 words) on HOW the utterance relates to the claim. Do not restate the claim.
- Use the claim IDs exactly as given.

INPUT: the claims and the transcript follow the "INPUT:" line below.

OUTPUT (return ONLY this JSON, no prose, no markdown fences):
{"claim_snippets":[{"claim_id":"c1","utterances":[{"utterance_id":"U0042","relevance":"…"}]}]}`;

type RawSnippetEntry = {
  claim_id: string;
  utterances?: { utterance_id?: string; relevance?: string }[];
};
type RawSnippetResult = { claim_snippets?: RawSnippetEntry[] };

export type FindSnippetsResult = {
  // claimId → ranked snippets (already resolved to timestamps).
  snippetsByClaimId: Map<string, ClaimSnippet[]>;
  usage: StageUsage;
};

export type ProgressFn = (message: string) => Promise<void> | void;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function findSnippets(
  claims: ClaimForSnippets[],
  transcript: IndexedTranscript,
  opts: {
    model: ModelId;
    effort?: Effort | "none";
    range?: Partial<SnippetRange>;
    batchSize?: number;
  },
  onProgress?: ProgressFn,
): Promise<FindSnippetsResult> {
  // Normalize the range: clamp to ≥1 and enforce min ≤ ideal ≤ max.
  const minReq = Math.max(1, opts.range?.min ?? DEFAULT_SNIPPET_RANGE.min);
  const maxReq = Math.max(minReq, opts.range?.max ?? DEFAULT_SNIPPET_RANGE.max);
  const idealReq = Math.min(
    maxReq,
    Math.max(minReq, opts.range?.ideal ?? DEFAULT_SNIPPET_RANGE.ideal),
  );
  const range: SnippetRange = { ideal: idealReq, min: minReq, max: maxReq };
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  // Reuse the pipeline's call machinery; only model + effort matter to it.
  const params: PipelineParams = {
    ...DEFAULT_PARAMS,
    model: opts.model,
    effort: opts.effort ?? "none",
  };
  const prompt = PROMPT_FIND_SNIPPETS(range);

  const snippetsByClaimId = new Map<string, ClaimSnippet[]>();
  let usage = emptyUsage();

  const batches = chunk(claims, batchSize);
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    if (onProgress) {
      await onProgress(
        `batch ${b + 1}/${batches.length} · ${batch.length} claims`,
      );
    }
    const claimList = batch.map((c) => ({ id: c.id, text: c.text }));
    const input = `INPUT:\n\nCLAIMS:\n${JSON.stringify(claimList, null, 2)}\n\nTRANSCRIPT:\n${transcript.text}`;

    const { parsed, usage: u } = await callJson<RawSnippetResult>(
      prompt,
      input,
      params,
    );
    usage = addUsage(usage, u);

    for (const entry of parsed.claim_snippets ?? []) {
      const claimId = entry.claim_id;
      if (!claimId) continue;
      const seen = new Set<string>();
      const resolved: ClaimSnippet[] = [];
      for (const u of entry.utterances ?? []) {
        const id = u.utterance_id;
        if (!id || seen.has(id)) continue;
        const utt = transcript.lookup.get(id);
        if (!utt) continue; // drop hallucinated / unknown ids
        seen.add(id);
        resolved.push({
          rank: resolved.length + 1,
          speakerName: utt.speakerName,
          speakerLabel: utt.speakerLabel,
          text: utt.text,
          startMs: utt.startMs,
          endMs: utt.endMs,
          relevance: u.relevance?.trim() || undefined,
        });
        if (resolved.length >= range.max) break;
      }
      if (resolved.length > 0) snippetsByClaimId.set(claimId, resolved);
    }
  }

  return { snippetsByClaimId, usage };
}
