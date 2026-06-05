/**
 * One-time pass: rewrite question and claim text to be more concise and direct.
 * Sends all texts in a single batch to Claude, then writes back to Supabase.
 * Positions, edges, handles, and relTypes are untouched.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/simplify-text.ts
 *   node --env-file=.env.local --import tsx scripts/simplify-text.ts "Google Xi Test7"
 */

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createClient } from "@supabase/supabase-js";

const TARGET_TITLE = process.argv[2] ?? "Google Xi Test7";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function rewriteTexts(
  texts: Record<string, string>,
): Promise<Record<string, string>> {
  const prompt = `You are editing argument map text to be more concise and plain.

RULES:
- Keep the original meaning and substance — do NOT change what is being argued
- Remove filler transitions like "Thus," / "Therefore," starting a new sentence that just restates the prior clause
- If a node has two sentences connected by "Thus" or "Therefore", either merge them into one tight sentence or keep only the stronger one
- Trim wordy phrases: "in order to" → "to", "the fact that" → drop, "due to the fact that" → "because"
- Do NOT oversimplify or lose nuance — these are argument map claims, not headlines
- Max length: 2 sentences. Aim for 1.
- Return plain English — no bullet points, no markdown, no quotes around the text
- For questions: keep them as questions, make them direct and crisp

INPUT — a JSON object mapping id to text:
${JSON.stringify(texts, null, 2)}

OUTPUT — return ONLY a JSON object with the same keys and the rewritten values. No prose, no fences.`;

  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    prompt,
  });

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in response:\n${text}`);
  return JSON.parse(match[0]) as Record<string, string>;
}

async function main() {
  console.log(`Fetching map: "${TARGET_TITLE}"…`);
  const { data, error } = await supabase
    .from("Dialectica_maps")
    .select("id, title, data")
    .eq("title", TARGET_TITLE)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`Map not found: "${TARGET_TITLE}"`);
  console.log(`Found map ${data.id}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = data.data as any;

  // Collect all human-readable text fields
  const texts: Record<string, string> = {};

  texts["__topQuestion"] = map.topQuestion;

  for (const crux of map.cruxes ?? []) {
    if (crux.question) texts[`crux__${crux.id}`] = crux.question;
  }

  for (const [nodeId, node] of Object.entries(map.nodes ?? {})) {
    const n = node as { text?: string };
    if (n.text) texts[nodeId] = n.text;
  }

  console.log(`Rewriting ${Object.keys(texts).length} texts via Claude…`);
  const rewritten = await rewriteTexts(texts);

  // Print a diff for review
  for (const [key, original] of Object.entries(texts)) {
    const updated = rewritten[key];
    if (updated && updated !== original) {
      console.log(`\n[${key}]`);
      console.log(`  before: ${original}`);
      console.log(`  after:  ${updated}`);
    }
  }

  // Apply rewrites back into map data
  if (rewritten["__topQuestion"]) {
    map.topQuestion = rewritten["__topQuestion"];
  }

  for (const crux of map.cruxes ?? []) {
    const key = `crux__${crux.id}`;
    if (rewritten[key]) crux.question = rewritten[key];
  }

  for (const [nodeId, node] of Object.entries(map.nodes ?? {})) {
    const n = node as { text?: string };
    if (rewritten[nodeId]) n.text = rewritten[nodeId];
  }

  // Write back
  const { error: updateError } = await supabase
    .from("Dialectica_maps")
    .update({ data: map })
    .eq("id", data.id);

  if (updateError) throw updateError;

  console.log(`\nDone — updated ${data.id} in Supabase.`);
  console.log(`Restart or hit /api/internal/reformat to revalidate the cache.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
