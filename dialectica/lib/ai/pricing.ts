// Per-model pricing for the cost calculator surfaced on the admin run page.
//
// Numbers are USD per 1M tokens, sourced from Anthropic's public pricing page.
// Verify before treating the displayed cost as authoritative for billing —
// pricing can shift and cached-read / cache-write multipliers in particular
// drift between announcements.
//
// `input` and `output` are the public list prices. `cacheRead` covers prompt-
// cache hits (Anthropic charges 10% of input). `cacheWrite` covers prompt-
// cache writes (1.25x input).
//
// Reasoning tokens (extended thinking) are charged at the OUTPUT rate.

export type ModelId =
  | "claude-sonnet-4-6"
  | "claude-opus-4-7"
  | "claude-opus-4-8"
  | "claude-haiku-4-5";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type ModelPrice = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export const MODEL_PRICING: Record<ModelId, ModelPrice> = {
  // $3 / $15 per million.
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  // $15 / $75 per million.
  "claude-opus-4-7": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-opus-4-8": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  // $1 / $5 per million.
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

export const AVAILABLE_MODELS: { id: ModelId; label: string }[] = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (default — fast + cheap)" },
  { id: "claude-opus-4-7", label: "Opus 4.7" },
  { id: "claude-opus-4-8", label: "Opus 4.8 (most capable)" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 (cheapest)" },
];

export const EFFORT_LEVELS: { id: Effort | "none"; label: string }[] = [
  { id: "none", label: "none (no extended thinking)" },
  { id: "low", label: "low" },
  { id: "medium", label: "medium" },
  { id: "high", label: "high" },
  { id: "xhigh", label: "xhigh" },
  { id: "max", label: "max" },
];

// One stage's worth of token counts. `reasoning` is the thinking-tokens count
// when `effort` is set; these are billed at the output rate.
export type StageUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
};

// Aggregated usage across all stages of a run. We keep the per-stage breakdown
// so the admin page can show where the cost went, plus a total for the running
// tally.
export type RunUsage = {
  model: ModelId;
  perStage: Record<string, StageUsage>;
  total: StageUsage;
  totalUsd: number;
};

export function emptyUsage(): StageUsage {
  return { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedInputTokens: 0 };
}

export function addUsage(a: StageUsage, b: StageUsage): StageUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
  };
}

export function costUsd(usage: StageUsage, model: ModelId): number {
  const p = MODEL_PRICING[model];
  // Anthropic bills cached *reads* at the discounted cacheRead rate; the
  // remaining (non-cached) input tokens at the full input rate. Reasoning
  // tokens are billed at the output rate.
  const billableInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const inputCost = (billableInput * p.input) / 1_000_000;
  const cachedCost = (usage.cachedInputTokens * p.cacheRead) / 1_000_000;
  const outputCost =
    ((usage.outputTokens + usage.reasoningTokens) * p.output) / 1_000_000;
  return inputCost + cachedCost + outputCost;
}

export function formatUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}
