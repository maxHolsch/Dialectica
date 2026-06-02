import { NextResponse } from "next/server";
import { currentUser } from "@/lib/data/users";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// GET    /api/generations/[runId] — return the run row (status, stage URLs, etc.).
// DELETE /api/generations/[runId] — delete the row and all its blob files.
//                                   Workflow runs that crashed or aren't useful
//                                   anymore. Does NOT cancel an in-flight Vercel
//                                   Workflow — the workflow runtime owns its
//                                   lifecycle; in practice a deleted run row
//                                   will cause subsequent step DB writes to
//                                   no-op against a missing id, which is fine.

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  const user = await currentUser();
  if (!user || user.role !== "edit") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { runId } = await ctx.params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("Dialectica_generations")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ run: data });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  const user = await currentUser();
  if (!user || user.role !== "edit") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { runId } = await ctx.params;
  const admin = createSupabaseAdminClient();

  // Best-effort blob cleanup. List the run's folder, remove all files. If the
  // folder is empty / never created, the list call returns [] and we skip.
  const { data: files } = await admin.storage
    .from("dialectica_generations")
    .list(runId);
  if (files && files.length > 0) {
    const paths = files.map((f) => `${runId}/${f.name}`);
    await admin.storage.from("dialectica_generations").remove(paths);
  }

  const { error } = await admin
    .from("Dialectica_generations")
    .delete()
    .eq("id", runId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
