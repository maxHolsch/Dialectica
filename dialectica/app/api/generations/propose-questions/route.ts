import { NextResponse } from "next/server";
import { currentUser } from "@/lib/data/users";
import { proposeSubQuestions } from "@/lib/ai/questionGuidedPipeline";
import { DEFAULT_PARAMS, type PipelineParams } from "@/lib/ai/pipeline";

// POST /api/generations/propose-questions — synchronous, edit-gated.
//
// Phase 7 (DIA-AI-1), question-guided pipeline. The curator submits the top
// question + transcript, this returns candidate sub-questions. NO row is
// inserted into Dialectica_generations — proposing is a cheap interactive
// step. The curator picks / edits the list client-side, then submits the
// committed selection to POST /api/generations.

export const runtime = "nodejs";
// One LLM call. Sonnet on a long transcript reliably under 60s; bump if max
// transcript length grows.
export const maxDuration = 120;

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "edit") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: {
    transcript?: string;
    top_question?: string;
    params?: Partial<PipelineParams>;
    target?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const transcript = (body.transcript ?? "").trim();
  const topQuestion = (body.top_question ?? "").trim();
  if (!transcript) {
    return NextResponse.json(
      { error: "transcript required" },
      { status: 400 },
    );
  }
  if (!topQuestion) {
    return NextResponse.json(
      { error: "top_question required" },
      { status: 400 },
    );
  }

  const params: PipelineParams = { ...DEFAULT_PARAMS, ...(body.params ?? {}) };

  try {
    const { questions } = await proposeSubQuestions({
      transcript,
      topQuestion,
      params,
      target: body.target,
    });
    return NextResponse.json({ questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
