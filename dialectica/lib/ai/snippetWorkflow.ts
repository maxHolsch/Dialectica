import { ArgMap, type ClaimSnippet } from "@/lib/schema";
import {
  updateRun,
  uploadStageBlob,
  recordStageUsage,
  appendLog,
  getMapData,
  updateMapData,
} from "./runStore";
import { buildIndexedTranscript } from "./snippets/transcript";
import {
  findSnippets,
  type ClaimForSnippets,
} from "./snippets/findSnippets";
import type { ModelId, Effort } from "./pricing";

// Standalone audio-snippet pipeline (Vercel Workflow). Runs AFTER claims exist
// on a map and BEFORE a new map is made — it does NOT build a map, it enriches
// an existing one. One step: find the top-N related utterances per claim, write
// `node.snippets` + `meta.audio` back onto the target map, record cost.
//
// Mirrors lib/ai/workflow.ts: `start(runSnippetWorkflow, [args])` from the API
// route; each `"use step"` persists progress so a crash resumes cleanly.

export type SnippetRunArgs = {
  runId: string;
  mapId: string;
  model: ModelId;
  effort: Effort | "none";
  /** Storage object path of the recording these snippets index into. */
  audioPath: string;
  /** Bucket holding the recording (signed on demand by the audio route). */
  audioBucket?: string;
  audioDurationMs?: number;
  /** Snippets per claim: aim for `ideal`, bounded by [min, max]. */
  snippetRange?: { ideal: number; min: number; max: number };
  batchSize?: number;
};

// Minimal raw-map shape. We mutate the RAW object (not the zod-parsed copy) so
// any keys the schema doesn't model are preserved on write-back.
type RawMap = {
  nodes: Record<
    string,
    { type?: string; text?: string; snippets?: ClaimSnippet[] }
  >;
  meta?: Record<string, unknown> | null;
};

async function stepGenerateSnippets(args: SnippetRunArgs): Promise<{
  mapId: string;
  claimCount: number;
  snippetCount: number;
}> {
  "use step";
  const { runId, mapId, model } = args;
  console.log(`[snip ${runId}] step:snippets map=${mapId} model=${model}`);
  await updateRun(runId, { status: "snippeting" });
  await appendLog(
    runId,
    "snippets",
    `loading map ${mapId} · model=${model}${args.effort !== "none" ? ` · effort=${args.effort}` : ""}`,
  );

  try {
    const raw = (await getMapData(mapId)) as RawMap | null;
    if (!raw) throw new Error(`map ${mapId} not found`);

    // Validate the stored map is well-formed before we touch it. The parsed
    // result is used only for reading claims; we mutate `raw` for write-back.
    const parsed = ArgMap.parse(raw);
    const claims: ClaimForSnippets[] = Object.values(parsed.nodes)
      .filter((n) => n.type === "claim")
      .map((n) => ({ id: n.id, text: n.text }));

    if (claims.length === 0) {
      throw new Error(`map ${mapId} has no claim nodes to snippet`);
    }

    const transcript = buildIndexedTranscript();
    await appendLog(
      runId,
      "snippets",
      `finding top snippets for ${claims.length} claims across ${transcript.utteranceCount} utterances`,
    );

    const { snippetsByClaimId, usage } = await findSnippets(
      claims,
      transcript,
      {
        model: args.model,
        effort: args.effort,
        range: args.snippetRange,
        batchSize: args.batchSize,
      },
      (msg) => appendLog(runId, "snippets", msg),
    );

    // Write snippets back onto the raw map. Clear every claim's snippets first
    // so a re-run never leaves stale entries on claims that now match nothing.
    let total = 0;
    for (const node of Object.values(raw.nodes)) {
      if (node.type !== "claim") continue;
      delete node.snippets;
    }
    for (const [claimId, snippets] of snippetsByClaimId) {
      const node = raw.nodes[claimId];
      if (!node) continue;
      node.snippets = snippets;
      total += snippets.length;
    }

    // Point the map at its recording so the drawer can play snippet spans.
    raw.meta = {
      ...(raw.meta ?? {}),
      audio: {
        path: args.audioPath,
        ...(args.audioBucket ? { bucket: args.audioBucket } : {}),
        ...(args.audioDurationMs ? { durationMs: args.audioDurationMs } : {}),
      },
    };

    // Re-validate the mutated map, then persist the raw object (extra keys kept).
    ArgMap.parse(raw);
    await updateMapData(mapId, raw);

    const path = await uploadStageBlob(runId, "snippets_path", {
      map_id: mapId,
      model,
      snippet_range: args.snippetRange ?? { ideal: 5, min: 3, max: 8 },
      audio: (raw.meta as { audio?: unknown }).audio,
      claims: Array.from(snippetsByClaimId.entries()).map(([id, s]) => ({
        claim_id: id,
        snippets: s,
      })),
    });
    await updateRun(runId, { snippets_path: path });
    await recordStageUsage(runId, "snippets", usage, model);

    await appendLog(
      runId,
      "snippets",
      `done · ${total} snippets across ${snippetsByClaimId.size}/${claims.length} claims · ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out`,
    );
    await updateRun(runId, { status: "succeeded", map_id: mapId, error: null });
    return { mapId, claimCount: claims.length, snippetCount: total };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await updateRun(runId, { status: "failed", error: `snippets: ${msg}` });
    throw e instanceof Error ? e : new Error(msg);
  }
}

export async function runSnippetWorkflow(args: SnippetRunArgs) {
  "use workflow";
  console.log(`[snip ${args.runId}] workflow start map=${args.mapId}`);
  const result = await stepGenerateSnippets(args);
  return result;
}
