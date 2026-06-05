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

// Admin form for the question-guided pipeline (Phase 7, second sensemaking
// option). Three steps live inside this single component:
//
//   1. Frame — title, top question, transcript, model/effort.
//   2. Propose — calls /api/generations/propose-questions, shows the model's
//      candidate sub-questions; the curator selects, edits, deletes, or adds
//      their own. These become the cruxes.
//   3. Submit — POSTs to /api/generations with pipeline_kind=question_guided
//      and the committed sub-questions, then routes to the run-detail page.

type Stage = "frame" | "review";

type Candidate = {
  text: string;
  selected: boolean;
  source: "proposed" | "manual";
};

export function QuestionGuidedForm() {
  const router = useRouter();

  // Stage 1 — frame
  const [title, setTitle] = useState("Untitled generation");
  const [topQuestion, setTopQuestion] = useState("What is this map about?");
  const [text, setText] = useState("");
  const [model, setModel] = useState<ModelId>("claude-sonnet-4.6");
  const [effort, setEffort] = useState<Effort | "none">("none");
  const [layoutStrategy, setLayoutStrategy] =
    useState<LayoutStrategyId>(DEFAULT_STRATEGY);

  // Stage 2 — review
  const [stage, setStage] = useState<Stage>("frame");
  const [proposing, setProposing] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [manualDraft, setManualDraft] = useState("");

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function paramsPayload() {
    return {
      // The question-guided pipeline ignores granularity / dedupLevel /
      // nQuestions / relationshipPalette — connections are short free-form
      // verb phrases, NOT palette-categorized. We send safe defaults purely
      // so the shared PipelineParams parser stays happy.
      granularity: "atomic" as const,
      dedupLevel: "conservative" as const,
      nQuestions: 5,
      relationshipPalette: [],
      model,
      effort,
    };
  }

  async function onPropose() {
    setError(null);
    if (!text.trim()) {
      setError("Paste the transcript first.");
      return;
    }
    if (!topQuestion.trim()) {
      setError("Give it a top-level question first.");
      return;
    }
    setProposing(true);
    try {
      const res = await fetch("/api/generations/propose-questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transcript: text,
          top_question: topQuestion,
          params: paramsPayload(),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { questions: string[] };
      setCandidates(
        body.questions.map((q) => ({
          text: q,
          selected: true,
          source: "proposed",
        })),
      );
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProposing(false);
    }
  }

  function toggleCandidate(idx: number) {
    setCandidates((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, selected: !c.selected } : c)),
    );
  }

  function updateCandidate(idx: number, value: string) {
    setCandidates((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, text: value } : c)),
    );
  }

  function removeCandidate(idx: number) {
    setCandidates((prev) => prev.filter((_, i) => i !== idx));
  }

  function addManual() {
    const trimmed = manualDraft.trim();
    if (!trimmed) return;
    setCandidates((prev) => [
      ...prev,
      { text: trimmed, selected: true, source: "manual" },
    ]);
    setManualDraft("");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const selected = candidates
      .filter((c) => c.selected)
      .map((c) => c.text.trim())
      .filter(Boolean);
    if (selected.length === 0) {
      setError("Select or add at least one sub-question.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("pipeline_kind", "question_guided");
      fd.set("source_kind", "text");
      fd.set("text", text);
      fd.set("title", title);
      fd.set("top_question", topQuestion);
      fd.set("layout_strategy", layoutStrategy);
      fd.set("params", JSON.stringify(paramsPayload()));
      fd.set("selected_questions", JSON.stringify(selected));

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
          placeholder="e.g. How much of the risk lies in the tool, vs how we use it?"
          className="w-full rounded-lg border border-dia-border-strong bg-dia-bg p-3 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
        />
      </Field>

      <Field label="Transcript text" full>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          required
          placeholder="Paste the discussion transcript here. The pipeline reads this when extracting claims AND when drawing connections — keep it complete."
          className="w-full rounded-lg border border-dia-border-strong bg-dia-bg p-3 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
        />
        <p className="mt-2 font-mono text-[12px] text-dia-fg-dim">
          Text only for now. (Audio still works on the free-form pipeline.)
        </p>
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
      </Field>

      <div className="col-span-2 rounded-lg border border-dia-border-strong bg-dia-surface-2 p-4 font-mono text-[12px] text-dia-fg-dim">
        Connections in this pipeline are short verb phrases (≤10 words,
        typically ~4) — e.g. &quot;Gives explanation to&quot;, &quot;Contests the
        significance of&quot;, &quot;Shifts responsibility from tool to user&quot;. No
        palette categories.
      </div>

      {stage === "frame" ? (
        <div className="col-span-2 flex items-center justify-between">
          <p className="font-mono text-[12px] text-dia-fg-dim">
            Step 1 — frame the map, then propose sub-questions.
          </p>
          <button
            type="button"
            onClick={onPropose}
            disabled={proposing}
            className="rounded-full bg-dia-mint px-6 py-3 font-mono text-[13px] font-bold tracking-[0.52px] text-black disabled:opacity-50"
          >
            {proposing ? "PROPOSING…" : "PROPOSE SUB-QUESTIONS →"}
          </button>
        </div>
      ) : (
        <ReviewSection
          candidates={candidates}
          manualDraft={manualDraft}
          setManualDraft={setManualDraft}
          toggleCandidate={toggleCandidate}
          updateCandidate={updateCandidate}
          removeCandidate={removeCandidate}
          addManual={addManual}
          reproposeDisabled={proposing}
          onRepropose={onPropose}
          onBack={() => setStage("frame")}
        />
      )}

      {error ? (
        <div className="col-span-2 rounded-lg border border-dia-pink/40 bg-dia-pink/10 px-4 py-3 font-mono text-[13px] text-dia-pink">
          {error}
        </div>
      ) : null}

      {stage === "review" ? (
        <div className="col-span-2 flex items-center justify-between">
          <p className="font-mono text-[12px] text-dia-fg-dim">
            Step 3 — selected sub-questions become the cruxes. Pipeline then
            extracts 4–5 claims per crux from the transcript, then draws
            transcript-grounded connections.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-dia-mint px-6 py-3 font-mono text-[13px] font-bold tracking-[0.52px] text-black disabled:opacity-50"
          >
            {submitting ? "STARTING…" : "+ GENERATE MAP"}
          </button>
        </div>
      ) : null}
    </form>
  );
}

function ReviewSection({
  candidates,
  manualDraft,
  setManualDraft,
  toggleCandidate,
  updateCandidate,
  removeCandidate,
  addManual,
  reproposeDisabled,
  onRepropose,
  onBack,
}: {
  candidates: Candidate[];
  manualDraft: string;
  setManualDraft: (v: string) => void;
  toggleCandidate: (i: number) => void;
  updateCandidate: (i: number, v: string) => void;
  removeCandidate: (i: number) => void;
  addManual: () => void;
  reproposeDisabled: boolean;
  onRepropose: () => void;
  onBack: () => void;
}) {
  const selectedCount = candidates.filter((c) => c.selected).length;
  return (
    <div className="col-span-2 rounded-lg border border-dia-border-strong bg-dia-surface p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-mono text-[12px] uppercase tracking-[0.48px] text-dia-fg-muted">
          Step 2 — pick the cruxes ({selectedCount} selected)
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full border border-dia-border-strong px-3 py-1 font-mono text-[11px] text-dia-fg-muted hover:text-dia-fg"
          >
            ← back to framing
          </button>
          <button
            type="button"
            onClick={onRepropose}
            disabled={reproposeDisabled}
            className="rounded-full border border-dia-border-strong px-3 py-1 font-mono text-[11px] text-dia-fg-muted hover:text-dia-fg disabled:opacity-50"
          >
            {reproposeDisabled ? "proposing…" : "↻ re-propose"}
          </button>
        </div>
      </div>

      <p className="mt-2 font-mono text-[12px] text-dia-fg-dim">
        Edit the wording in place, deselect any that don&apos;t fit, or add your
        own. These will become the cruxes of the map.
      </p>

      <ul className="mt-4 space-y-2">
        {candidates.map((c, i) => (
          <li
            key={i}
            className={
              "flex items-start gap-3 rounded-lg border p-3 " +
              (c.selected
                ? "border-dia-mint/40 bg-dia-mint/5"
                : "border-dia-border-strong bg-dia-surface-2 opacity-60")
            }
          >
            <input
              type="checkbox"
              checked={c.selected}
              onChange={() => toggleCandidate(i)}
              className="mt-1 h-4 w-4 accent-dia-mint"
            />
            <textarea
              value={c.text}
              onChange={(e) => updateCandidate(i, e.target.value)}
              rows={1}
              className="min-h-[2.25rem] flex-1 resize-y rounded border border-dia-border-strong bg-dia-bg p-2 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
            />
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.4px] text-dia-fg-dim">
              {c.source}
            </span>
            <button
              type="button"
              onClick={() => removeCandidate(i)}
              className="font-mono text-[12px] text-dia-fg-dim hover:text-dia-pink"
            >
              ✕
            </button>
          </li>
        ))}
        {candidates.length === 0 ? (
          <li className="font-mono text-[12px] text-dia-fg-dim">
            No candidates yet. Add one below or re-propose.
          </li>
        ) : null}
      </ul>

      <div className="mt-4 flex gap-2">
        <input
          value={manualDraft}
          onChange={(e) => setManualDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addManual();
            }
          }}
          placeholder="Add your own sub-question…"
          className="flex-1 rounded-lg border border-dia-border-strong bg-dia-bg p-3 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
        />
        <button
          type="button"
          onClick={addManual}
          className="rounded-full border border-dia-border-strong px-4 py-2 font-mono text-[12px] text-dia-fg-muted hover:text-dia-fg"
        >
          + add
        </button>
      </div>
    </div>
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
