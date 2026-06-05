import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  type StageUsage,
  type ModelId,
  addUsage,
  emptyUsage,
  costUsd,
} from "./pricing";

// Helpers shared by the Phase 7 workflow steps. Both Supabase Storage writes
// and `Dialectica_generations` updates live here so the workflow file itself
// stays focused on orchestration.
//
// Bucket setup (one-time, via Supabase Studio → Storage → New bucket):
//   - Name: dialectica_generations
//   - Public: NO (private). All access goes through the service-role admin
//     client — either `download()` for server-side rendering or freshly-minted
//     signed URLs for "open raw ↗" links. No RLS policies on storage.objects
//     are needed because the admin client bypasses RLS.
//
// What lives in the DB: paths (e.g. "gen-xxx/distilled.json"), never URLs.
// Signed URLs are minted on demand so old runs never rot.

const BUCKET = "dialectica_generations";

// 1-hour TTL covers both admin browsing (long enough to skim a run) and
// AssemblyAI's audio fetch (it pulls the file at job submission). Bump if a
// stage page is left open for hours and links start 403-ing.
const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60;

export type RunStatus =
  | "queued"
  | "transcribing"
  | "extracting"
  | "distilling"
  | "organizing"
  | "relating"
  | "fact_checking"
  | "quoting"
  | "mapping"
  | "succeeded"
  | "failed";

export type StageKey =
  | "transcript_path"
  | "raw_claims_path"
  | "distilled_path"
  | "questions_path"
  | "relations_path"
  | "fact_check_path"
  | "quotes_path";

const STAGE_BLOB_EXT: Record<StageKey, "txt" | "json"> = {
  transcript_path: "txt",
  raw_claims_path: "json",
  distilled_path: "json",
  questions_path: "json",
  relations_path: "json",
  fact_check_path: "json",
  quotes_path: "json",
};

// Uploads a stage payload and returns the storage path (NOT a URL).
export async function uploadStageBlob(
  runId: string,
  stage: StageKey,
  payload: unknown,
): Promise<string> {
  const ext = STAGE_BLOB_EXT[stage];
  const body =
    ext === "json" ? JSON.stringify(payload, null, 2) : String(payload ?? "");
  const path = `${runId}/${stage}.${ext}`;
  const contentType = ext === "json" ? "application/json" : "text/plain";

  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(
      `uploadStageBlob(${runId}/${stage}) failed: ${error.message}`,
    );
  }
  return path;
}

// Audio uploads come from the multipart form handler, not a workflow step.
// Returns the storage path; the route handler mints a fresh signed URL right
// before calling `start()` so AssemblyAI gets a working URL even if the upload
// happened a while before the workflow actually picks the job up.
export async function uploadAudioSource(
  runId: string,
  file: File,
): Promise<string> {
  const ext = (file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ".m4a").toLowerCase();
  const path = `${runId}/source${ext}`;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "audio/m4a",
    upsert: true,
  });
  if (error) {
    throw new Error(`uploadAudioSource(${runId}) failed: ${error.message}`);
  }
  return path;
}

export async function signedUrlFor(
  path: string,
  expiresIn = DEFAULT_SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) {
    throw new Error(
      `signedUrlFor(${path}) failed: ${error?.message ?? "no data"}`,
    );
  }
  return data.signedUrl;
}

// Server-side fetch helpers. The admin run-detail page uses these to render
// stage JSON inline without ever touching a signed URL.
export async function downloadBlobText(path: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return await data.text();
}

export async function downloadBlobJson<T = unknown>(
  path: string,
): Promise<T | null> {
  const text = await downloadBlobText(path);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function updateRun(
  runId: string,
  patch: Partial<{
    status: RunStatus;
    error: string | null;
    map_id: string | null;
    workflow_run_id: string | null;
    transcript_path: string;
    raw_claims_path: string;
    distilled_path: string;
    questions_path: string;
    relations_path: string;
    fact_check_path: string;
    quotes_path: string;
  }>,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("Dialectica_generations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) throw new Error(`updateRun(${runId}) failed: ${error.message}`);
}

// Accumulates one stage's usage onto the run row. Reads-modifies-writes the
// `usage` JSONB column. The admin page reads this back and shows a running
// USD tally via `costUsd()`.
//
// Race-condition note: stages execute strictly sequentially inside a single
// workflow run, so we don't need a lock here.
//
// When the same stage is recorded more than once in a run (e.g. the
// question-guided pipeline calls this twice for "relate" — once for the
// within-question pass, once for the cross-question pass), the per-stage
// bucket accumulates rather than overwrites. Without this the displayed
// per-stage row would show only the LAST recorded call while the total
// silently includes earlier ones — the bug that produced a $22 total under
// $11 worth of visible stages.
export async function recordStageUsage(
  runId: string,
  stage:
    | "extract"
    | "distill"
    | "organize"
    | "relate"
    | "fact_check"
    | "quotes",
  usage: StageUsage,
  model: ModelId,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: row, error: readErr } = await admin
    .from("Dialectica_generations")
    .select("usage")
    .eq("id", runId)
    .maybeSingle();
  if (readErr) throw new Error(`recordStageUsage read failed: ${readErr.message}`);

  type StoredUsage = {
    model: ModelId;
    perStage: Record<string, StageUsage>;
    total: StageUsage;
  };
  const prior: StoredUsage = (row?.usage as StoredUsage | null) ?? {
    model,
    perStage: {},
    total: emptyUsage(),
  };

  const priorStage = prior.perStage[stage] ?? emptyUsage();
  const next: StoredUsage = {
    model, // Always trust the latest model — admin can change mid-iteration
    perStage: { ...prior.perStage, [stage]: addUsage(priorStage, usage) },
    total: addUsage(prior.total, usage),
  };

  const { error: writeErr } = await admin
    .from("Dialectica_generations")
    .update({
      usage: { ...next, totalUsd: costUsd(next.total, model) },
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (writeErr) throw new Error(`recordStageUsage write failed: ${writeErr.message}`);
}

export type LogEntry = { at: string; stage: string; message: string };

// Per-run promise chain. Stage 1 fans out chunks in parallel, so we'd race
// the read-modify-write on the JSONB log column without serialization. The
// chain is process-local — fine because a single workflow step instance does
// all the appending for one runId.
const logChains: Map<string, Promise<void>> = new Map();

async function doAppend(
  runId: string,
  stage: string,
  message: string,
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: row, error: readErr } = await admin
      .from("Dialectica_generations")
      .select("log")
      .eq("id", runId)
      .maybeSingle();
    if (readErr) {
      console.error(
        `[appendLog ${runId}] READ failed: ${readErr.message} (code=${readErr.code ?? "?"} hint=${readErr.hint ?? "?"})`,
      );
    }

    const existing = (row?.log as LogEntry[] | null) ?? [];
    const next: LogEntry[] = [
      ...existing,
      { at: new Date().toISOString(), stage, message },
    ].slice(-500);

    const { error: writeErr } = await admin
      .from("Dialectica_generations")
      .update({ log: next, updated_at: new Date().toISOString() })
      .eq("id", runId);
    if (writeErr) {
      // Don't throw — a failed log write should never tank the workflow step.
      console.error(
        `[appendLog ${runId}] WRITE failed: ${writeErr.message} (code=${writeErr.code ?? "?"} hint=${writeErr.hint ?? "?"})`,
      );
    }
  } catch (e) {
    // Catch any other thrown error (network, JSON, etc.) so a logging failure
    // can never tank the workflow step. Surface to console for debugging.
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error(`[appendLog ${runId}] threw: ${msg}`);
  }
}

// Append one entry to the run's activity log. Serialized per-runId so
// concurrent chunk workers don't clobber each other. We cap the log at 500
// entries — long enough for a chunky transcript, short enough to keep the
// row reasonable.
export async function appendLog(
  runId: string,
  stage: string,
  message: string,
): Promise<void> {
  const prev = logChains.get(runId) ?? Promise.resolve();
  const next = prev.then(() => doAppend(runId, stage, message)).catch(() => {});
  logChains.set(runId, next);
  return next;
}

export async function insertMap(
  mapId: string,
  title: string,
  ownerId: string | null,
  data: unknown,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("Dialectica_maps").insert({
    id: mapId,
    title,
    visibility: "private",
    owner_id: ownerId,
    data,
  });
  if (error) throw new Error(`insertMap(${mapId}) failed: ${error.message}`);
}
