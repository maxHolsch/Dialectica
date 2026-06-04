"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AVAILABLE_MODELS,
  EFFORT_LEVELS,
  MODEL_PRICING,
  type ModelId,
  type Effort,
} from "@/lib/ai/pricing";
import {
  LAYOUT_STRATEGIES,
  DEFAULT_STRATEGY,
  type LayoutStrategyId,
} from "@/lib/layout/strategies";
import { QuestionGuidedForm } from "./QuestionGuidedForm";

// DIA-AI-4 admin entry point: kick off a new generation run. Posts
// multipart/form-data to /api/generations and on success routes to the
// run-detail page so the operator can watch stages tick through.
//
// Two pipeline kinds live under this section (ROADMAP Phase 7):
//   free_form       — the original distill / organize / relate pipeline
//   question_guided — curator picks the cruxes; the model extracts 4-5 claims
//                     per question from the transcript, then draws
//                     transcript-grounded connections between them.

type Granularity = "atomic" | "bundled";
type DedupLevel = "conservative" | "aggressive";

const DEFAULT_PALETTE = "supports, challenges, qualifies, reframes, depends-on, raises";

type PipelineKind = "free_form" | "question_guided";

export function NewGenerationForm() {
  const [pipelineKind, setPipelineKind] = useState<PipelineKind>("free_form");

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.48px] text-dia-fg-dim">
          Pipeline
        </span>
        <PipelineToggle
          on={pipelineKind === "free_form"}
          onClick={() => setPipelineKind("free_form")}
          label="Free-form distillation"
          sublabel="Extract everything → dedup → infer cruxes"
        />
        <PipelineToggle
          on={pipelineKind === "question_guided"}
          onClick={() => setPipelineKind("question_guided")}
          label="Question-guided"
          sublabel="You pick the cruxes → claims pulled per question → transcript-grounded connections"
        />
      </div>

      {pipelineKind === "free_form" ? (
        <FreeFormGenerationForm />
      ) : (
        <QuestionGuidedForm />
      )}
    </div>
  );
}

function PipelineToggle({
  on,
  onClick,
  label,
  sublabel,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  sublabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={sublabel}
      className={
        on
          ? "rounded-full bg-dia-mint px-4 py-1.5 font-mono text-[12px] font-bold text-black"
          : "rounded-full border border-dia-border-strong px-4 py-1.5 font-mono text-[12px] text-dia-fg-muted hover:text-dia-fg"
      }
    >
      {label}
    </button>
  );
}

function FreeFormGenerationForm() {
  const router = useRouter();
  const [sourceKind, setSourceKind] = useState<"text" | "audio">("text");
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [title, setTitle] = useState("Untitled generation");
  const [topQuestion, setTopQuestion] = useState("What is this map about?");
  const [granularity, setGranularity] = useState<Granularity>("atomic");
  const [dedupLevel, setDedupLevel] = useState<DedupLevel>("conservative");
  const [nQuestions, setNQuestions] = useState(5);
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  const [model, setModel] = useState<ModelId>("claude-sonnet-4.6");
  const [effort, setEffort] = useState<Effort | "none">("none");
  const [layoutStrategy, setLayoutStrategy] =
    useState<LayoutStrategyId>(DEFAULT_STRATEGY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("source_kind", sourceKind);
      if (sourceKind === "text") fd.set("text", text);
      else if (audio) fd.set("audio", audio);
      fd.set("title", title);
      fd.set("top_question", topQuestion);
      fd.set("layout_strategy", layoutStrategy);
      fd.set(
        "params",
        JSON.stringify({
          granularity,
          dedupLevel,
          nQuestions: Math.max(3, Math.min(7, nQuestions)),
          relationshipPalette: palette
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          model,
          effort,
        }),
      );

      const res = await fetch("/api/generations", { method: "POST", body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { runId: string };
      router.push(`/admin/runs/${body.runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 text-dia-fg"
    >
      <Field label="Source" full>
        <div className="flex gap-2">
          <Toggle
            on={sourceKind === "text"}
            onClick={() => setSourceKind("text")}
            label="Text transcript"
          />
          <Toggle
            on={sourceKind === "audio"}
            onClick={() => setSourceKind("audio")}
            label="Audio (.m4a)"
          />
        </div>
      </Field>

      {sourceKind === "text" ? (
        <Field label="Transcript text" full>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            required
            placeholder="Paste the discussion transcript here…"
            className="w-full rounded-lg border border-dia-border-strong bg-dia-bg p-3 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
          />
        </Field>
      ) : (
        <Field label="Audio file" full>
          <input
            type="file"
            accept="audio/*,.m4a,.mp3,.wav"
            onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
            required
            className="block w-full font-mono text-[13px] text-dia-fg-muted file:mr-4 file:rounded-full file:border-0 file:bg-dia-mint file:px-4 file:py-2 file:font-bold file:text-black"
          />
          <p className="mt-2 font-mono text-[12px] text-dia-fg-dim">
            AssemblyAI transcribes before stage 1. Status will read
            &quot;transcribing&quot; while it runs.
          </p>
        </Field>
      )}

      <Field label="Map title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full rounded-lg border border-dia-border-strong bg-dia-bg p-3 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
        />
      </Field>
      <Field label="Top-level question">
        <input
          value={topQuestion}
          onChange={(e) => setTopQuestion(e.target.value)}
          required
          className="w-full rounded-lg border border-dia-border-strong bg-dia-bg p-3 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
        />
      </Field>

      <Field label="Granularity">
        <div className="flex gap-2">
          <Toggle
            on={granularity === "atomic"}
            onClick={() => setGranularity("atomic")}
            label="atomic"
          />
          <Toggle
            on={granularity === "bundled"}
            onClick={() => setGranularity("bundled")}
            label="bundled"
          />
        </div>
      </Field>
      <Field label="Dedup level">
        <div className="flex gap-2">
          <Toggle
            on={dedupLevel === "conservative"}
            onClick={() => setDedupLevel("conservative")}
            label="conservative"
          />
          <Toggle
            on={dedupLevel === "aggressive"}
            onClick={() => setDedupLevel("aggressive")}
            label="aggressive"
          />
        </div>
      </Field>
      <Field label="N central questions (3–7)">
        <input
          type="number"
          min={3}
          max={7}
          value={nQuestions}
          onChange={(e) => setNQuestions(Number(e.target.value))}
          className="w-32 rounded-lg border border-dia-border-strong bg-dia-bg p-3 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
        />
      </Field>
      <Field label="Model">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value as ModelId)}
          className="w-full rounded-lg border border-dia-border-strong bg-dia-bg p-3 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
        >
          {AVAILABLE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — ${MODEL_PRICING[m.id].input}/M in · $
              {MODEL_PRICING[m.id].output}/M out
            </option>
          ))}
        </select>
      </Field>
      <Field label="Effort (extended thinking)">
        <select
          value={effort}
          onChange={(e) => setEffort(e.target.value as Effort | "none")}
          className="w-full rounded-lg border border-dia-border-strong bg-dia-bg p-3 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
        >
          {EFFORT_LEVELS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
        <p className="mt-2 font-mono text-[12px] text-dia-fg-dim">
          Higher effort = more reasoning tokens (billed at output rate).
          Usually improves Stage-2 dedup and Stage-4 relationship texture; can
          easily double the cost.
        </p>
      </Field>

      <Field label="Auto-format layout" full>
        <select
          value={layoutStrategy}
          onChange={(e) =>
            setLayoutStrategy(e.target.value as LayoutStrategyId)
          }
          className="w-full rounded-lg border border-dia-border-strong bg-dia-bg p-3 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
        >
          {Object.values(LAYOUT_STRATEGIES).map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} — {s.description}
            </option>
          ))}
        </select>
        <p className="mt-2 font-mono text-[12px] text-dia-fg-dim">
          Layout applied to the freshly-built map before the first &quot;Open Map&quot;.
          You can re-format with a different strategy from the run detail page
          or the edit-mode toolbar after the run completes.
        </p>
      </Field>

      <details className="col-span-2 rounded-lg border border-dia-border-strong bg-dia-surface-2 p-4">
        <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.48px] text-dia-fg-dim hover:text-dia-fg-muted">
          Advanced
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-y-5">
          <Field label="Relationship palette (comma-separated)" full>
            <input
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
              className="w-full rounded-lg border border-dia-border-strong bg-dia-bg p-3 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
            />
            <p className="mt-2 font-mono text-[12px] text-dia-fg-dim">
              Soft default vocabulary for the <em>kind</em> of each
              relationship. Stage 4 prefers these labels but coins new
              hyphenated ones when nothing fits. The per-edge{" "}
              <code>note</code> field carries the <em>specific</em> explanation
              of how the relationship holds. Don&apos;t use pro/con framing.
            </p>
          </Field>
        </div>
      </details>

      {error ? (
        <div className="col-span-2 rounded-lg border border-dia-pink/40 bg-dia-pink/10 px-4 py-3 font-mono text-[13px] text-dia-pink">
          {error}
        </div>
      ) : null}

      <div className="col-span-2 flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-dia-mint px-6 py-3 font-mono text-[13px] font-bold tracking-[0.52px] text-black disabled:opacity-50"
        >
          {submitting ? "STARTING…" : "+ START GENERATION"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="block font-mono text-[11px] uppercase tracking-[0.48px] text-dia-fg-dim">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        on
          ? "rounded-full bg-dia-mint px-4 py-1.5 font-mono text-[12px] font-bold text-black"
          : "rounded-full border border-dia-border-strong px-4 py-1.5 font-mono text-[12px] text-dia-fg-muted"
      }
    >
      {label}
    </button>
  );
}
