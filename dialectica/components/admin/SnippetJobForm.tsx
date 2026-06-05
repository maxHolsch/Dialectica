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

// Standalone "generate audio snippets" trigger. Runs the snippet pipeline
// against an EXISTING map's claims (after claims exist, before a new map is
// made), with a selectable model (default Sonnet 4.6). Posts to
// /api/maps/[mapId]/snippets and routes to the run-detail page to watch cost +
// progress.

const DEFAULT_MAP_ID = "google-xi-test7";
const DEFAULT_AUDIO_PATH = "google-xi-test7.mp3";

export function SnippetJobForm({
  maps,
}: {
  maps: { id: string; title: string }[];
}) {
  const router = useRouter();
  const hasDefault = maps.some((m) => m.id === DEFAULT_MAP_ID);
  const [mapId, setMapId] = useState<string>(
    hasDefault ? DEFAULT_MAP_ID : (maps[0]?.id ?? DEFAULT_MAP_ID),
  );
  const [model, setModel] = useState<ModelId>("claude-sonnet-4.6");
  const [effort, setEffort] = useState<Effort | "none">("none");
  const [audioPath, setAudioPath] = useState(DEFAULT_AUDIO_PATH);
  // Snippets per claim is a range: aim for `ideal`, bounded by [lower, upper].
  const [idealCount, setIdealCount] = useState(5);
  const [minCount, setMinCount] = useState(3);
  const [maxCount, setMaxCount] = useState(8);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/maps/${encodeURIComponent(mapId)}/snippets`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            effort,
            audioPath: audioPath.trim() || undefined,
            idealCount,
            minCount,
            maxCount,
          }),
        },
      );
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
      <Field label="Map" full>
        {maps.length > 0 ? (
          <select
            value={mapId}
            onChange={(e) => setMapId(e.target.value)}
            className="w-full rounded-lg border border-dia-border-strong bg-dia-bg p-3 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
          >
            {!maps.some((m) => m.id === mapId) ? (
              <option value={mapId}>{mapId}</option>
            ) : null}
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} — {m.title}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={mapId}
            onChange={(e) => setMapId(e.target.value)}
            required
            className="w-full rounded-lg border border-dia-border-strong bg-dia-bg p-3 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
          />
        )}
        <p className="mt-2 font-mono text-[12px] text-dia-fg-dim">
          Finds the top-5 related transcript snippets (with audio timestamps)
          for every claim on this map and writes them back. Re-runnable.
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

      <Field label="Snippets per claim (ideal · lower · upper)" full>
        <div className="flex items-end gap-4">
          <CountInput label="ideal" value={idealCount} onChange={setIdealCount} />
          <span className="pb-3 font-mono text-[13px] text-dia-fg-dim">·</span>
          <CountInput label="lower" value={minCount} onChange={setMinCount} />
          <span className="pb-3 font-mono text-[13px] text-dia-fg-dim">·</span>
          <CountInput label="upper" value={maxCount} onChange={setMaxCount} />
        </div>
        <p className="mt-2 font-mono text-[12px] text-dia-fg-dim">
          The model aims for the ideal count per claim and stays within the
          lower/upper bounds — returning fewer than the lower bound only when a
          claim genuinely has few related moments.
        </p>
      </Field>

      <details className="col-span-2 rounded-lg border border-dia-border-strong bg-dia-surface-2 p-4">
        <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.48px] text-dia-fg-dim hover:text-dia-fg-muted">
          Advanced
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-y-5">
          <Field label="Audio object path (dialectica-audio bucket)" full>
            <input
              value={audioPath}
              onChange={(e) => setAudioPath(e.target.value)}
              className="w-full rounded-lg border border-dia-border-strong bg-dia-bg p-3 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
            />
            <p className="mt-2 font-mono text-[12px] text-dia-fg-dim">
              The compressed recording the snippets index into. Upload it to the
              public <code>dialectica-audio</code> bucket first.
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
          {submitting ? "STARTING…" : "+ GENERATE AUDIO SNIPPETS"}
        </button>
      </div>
    </form>
  );
}

function CountInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.4px] text-dia-fg-dim">
        {label}
      </span>
      <input
        type="number"
        min={1}
        max={20}
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        className="w-20 rounded-lg border border-dia-border-strong bg-dia-bg p-3 font-mono text-[13px] text-dia-fg outline-none focus:border-dia-mint"
      />
    </label>
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
