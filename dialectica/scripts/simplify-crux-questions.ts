/**
 * Two-step pass on Google Xi Test7:
 *  1. Restore McLuhan Tetrad vocabulary in node texts (obsoletes, retrieves)
 *  2. Shorten crux questions — aim for ≤14 words, crisp and direct
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/simplify-crux-questions.ts
 */

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createClient } from "@supabase/supabase-js";

const MAP_ID = "map-gen-nyiz0g-mpzuxlzq";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function shortenQuestions(
  questions: Record<string, string>,
): Promise<Record<string, string>> {
  const prompt = `You are editing argument map questions to be shorter and more direct.

RULES:
- Target length: ≤14 words. Shorter is better.
- Keep them as questions.
- Preserve the core tension or substance — don't collapse a two-sided question into one side.
- Do NOT use jargon or introduce new framing.
- IMPORTANT: Preserve any McLuhan Tetrad vocabulary if present: obsoletes, extends, reverses, retrieves.
- No markdown, no quotes around the result.

INPUT — JSON mapping id to current question text:
${JSON.stringify(questions, null, 2)}

OUTPUT — return ONLY a JSON object with the same keys and shortened versions. No prose, no fences.`;

  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    prompt,
  });

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in response:\n${text}`);
  return JSON.parse(match[0]) as Record<string, string>;
}

async function main() {
  console.log(`Fetching map ${MAP_ID}…`);
  const { data, error } = await supabase
    .from("Dialectica_maps")
    .select("data")
    .eq("id", MAP_ID)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`Map not found`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = data.data as any;

  // ── Step 1: restore McLuhan Tetrad terms ──
  const tetradFixes: Record<string, string> = {
    q1c2: "Remixing teams every 21 days obsoletes the shared history that makes a team a team.",
    q3c4: "AI trains us to ask more intentional questions, retrieving better communication habits.",
  };

  for (const [nodeId, text] of Object.entries(tetradFixes)) {
    const before = map.nodes[nodeId]?.text;
    if (before !== text) {
      console.log(`\n[${nodeId}] restoring McLuhan term`);
      console.log(`  before: ${before}`);
      console.log(`  after:  ${text}`);
      map.nodes[nodeId].text = text;
    }
  }

  // ── Step 2: shorten crux questions ──
  const cruxQuestions: Record<string, string> = {};
  for (const crux of map.cruxes ?? []) {
    if (crux.question) cruxQuestions[crux.id] = crux.question;
  }

  console.log(`\nShortening ${Object.keys(cruxQuestions).length} crux questions…`);
  const shortened = await shortenQuestions(cruxQuestions);

  for (const crux of map.cruxes ?? []) {
    const updated = shortened[crux.id];
    if (updated && updated !== crux.question) {
      console.log(`\n[${crux.id}]`);
      console.log(`  before: ${crux.question}`);
      console.log(`  after:  ${updated}`);
      crux.question = updated;
    }
  }

  // ── Write back ──
  const { error: updateError } = await supabase
    .from("Dialectica_maps")
    .update({ data: map })
    .eq("id", MAP_ID);

  if (updateError) throw updateError;
  console.log(`\nDone — saved. Run layout-format.ts to revalidate cache.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
