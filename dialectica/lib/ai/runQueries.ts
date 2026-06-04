import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ModelId, StageUsage } from "./pricing";

// Server-side reads for the admin pages. RLS on Dialectica_generations already
// gates by role = 'edit', so we use the auth-aware client (not the admin one)
// so a misconfigured query fails closed.
//
// Storage helpers (download / signed URLs) live in `runStore.ts` and use the
// admin client because the private bucket has no RLS. Keep that separation.

export type StoredUsage = {
  model: ModelId;
  perStage: Record<string, StageUsage>;
  total: StageUsage;
  totalUsd: number;
};

export type RunRow = {
  id: string;
  workflow_run_id: string | null;
  source_kind: "text" | "audio";
  source_label: string | null;
  params: {
    granularity?: "atomic" | "bundled";
    dedupLevel?: "conservative" | "aggressive";
    nQuestions?: number;
    relationshipPalette?: string[];
    model?: ModelId;
    effort?: "low" | "medium" | "high" | "xhigh" | "max" | "none";
  };
  usage: StoredUsage | null;
  status:
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
  error: string | null;
  transcript_path: string | null;
  raw_claims_path: string | null;
  distilled_path: string | null;
  questions_path: string | null;
  relations_path: string | null;
  fact_check_path: string | null;
  quotes_path: string | null;
  map_id: string | null;
  log: { at: string; stage: string; message: string }[] | null;
  created_at: string;
  updated_at: string;
};

export async function listRuns(): Promise<RunRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("Dialectica_generations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as RunRow[];
}

export async function getRun(runId: string): Promise<RunRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("Dialectica_generations")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RunRow | null) ?? null;
}
