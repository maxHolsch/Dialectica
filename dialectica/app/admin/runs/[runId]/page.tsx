import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { currentUser, avatarFor } from "@/lib/data/users";
import { Topbar } from "@/components/topbar/Topbar";
import { getRun } from "@/lib/ai/runQueries";
import {
  downloadBlobJson,
  downloadBlobText,
  signedUrlFor,
} from "@/lib/ai/runStore";
import type {
  RawClaim,
  DistilledClaim,
  CentralQuestion,
  Relationship,
  CrossQuestionRelationship,
  MomentumLens,
  FactCheckTodoRaw,
} from "@/lib/ai/pipeline";
import { RunPoller } from "@/components/admin/RunPoller";
import { ReformatMapPicker } from "@/components/admin/ReformatMapPicker";
import { formatUsd, costUsd, type ModelId } from "@/lib/ai/pricing";

// Mint a 1-hour signed URL for a path. Returns null when the path is null so
// the StageGrid renders a "pending" cell.
async function signed(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    return await signedUrlFor(path);
  } catch {
    return null;
  }
}

// DIA-AI-4 run detail. Shows stage status, raw transcript, every stage's
// intermediate JSON, the distilled-claims view with `absorbed` expandable
// (this is the highest-value human-review step), and momentum + fact-check
// todos. Polls the API while the run is still pending so status updates land
// without manual refresh.

export const dynamic = "force-dynamic";

export default async function RunDetailPage(props: {
  params: Promise<{ runId: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/admin");
  if (user.role !== "edit") redirect("/");

  const { runId } = await props.params;
  const run = await getRun(runId);
  if (!run) notFound();

  const [
    transcript,
    rawClaims,
    distilled,
    questions,
    relations,
    factCheck,
    transcriptSigned,
    rawClaimsSigned,
    distilledSigned,
    questionsSigned,
    relationsSigned,
    factCheckSigned,
  ] = await Promise.all([
    run.transcript_path ? downloadBlobText(run.transcript_path) : null,
    run.raw_claims_path
      ? downloadBlobJson<{ claims: RawClaim[] } | RawClaim[]>(run.raw_claims_path)
      : null,
    run.distilled_path
      ? downloadBlobJson<{ claims: DistilledClaim[] }>(run.distilled_path)
      : null,
    run.questions_path
      ? downloadBlobJson<{ central_questions: CentralQuestion[] }>(
          run.questions_path,
        )
      : null,
    run.relations_path
      ? downloadBlobJson<{
          relationships: Relationship[];
          cross_question_relationships: CrossQuestionRelationship[];
          momentum: MomentumLens;
        }>(run.relations_path)
      : null,
    run.fact_check_path
      ? downloadBlobJson<{ fact_check_todos: FactCheckTodoRaw[] }>(
          run.fact_check_path,
        )
      : null,
    signed(run.transcript_path),
    signed(run.raw_claims_path),
    signed(run.distilled_path),
    signed(run.questions_path),
    signed(run.relations_path),
    signed(run.fact_check_path),
  ]);

  const rawClaimsArr = Array.isArray(rawClaims)
    ? rawClaims
    : (rawClaims?.claims ?? []);

  const avatar = avatarFor(user);
  const isTerminal = run.status === "succeeded" || run.status === "failed";

  // Pipeline kind is stamped onto params by /api/generations. "free_form" is
  // the original distill → organize → relate flow; "question_guided" skips
  // distill/organize entirely (curator picks the cruxes) and pulls per-question
  // claims from the transcript before relating with the transcript in context.
  const pipelineKind: "free_form" | "question_guided" =
    (run.params as { pipelineKind?: string }).pipelineKind === "question_guided"
      ? "question_guided"
      : "free_form";
  const isQuestionGuided = pipelineKind === "question_guided";

  return (
    <div className="flex min-h-screen flex-col bg-dia-bg">
      <Topbar
        crumbs={[
          { kind: "brand", label: "DIALECTIA", href: "/" },
          { kind: "sep-slash" },
          { kind: "medium", label: "Admin", href: "/admin" },
          { kind: "sep-slash" },
          { kind: "dim", label: run.id },
        ]}
        pill={{ kind: "settings" }}
        avatars={[avatar]}
      />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-12 py-12">
        {!isTerminal ? <RunPoller runId={run.id} /> : null}

        <header className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-[32px] font-normal tracking-[-0.64px] text-dia-fg">
              {run.id}
            </h1>
            <p className="mt-1 font-mono text-[13px] text-dia-fg-dim">
              <span className="mr-2 rounded-full bg-dia-blue/15 px-2 py-0.5 text-dia-blue">
                {isQuestionGuided ? "question-guided" : "free-form"}
              </span>
              {run.source_kind}
              {run.source_label ? ` · ${run.source_label}` : ""} ·{" "}
              {new Date(run.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {run.map_id ? (
              <>
                <ReformatMapPicker mapId={run.map_id} />
                <Link
                  href={`/m/${run.map_id}/crux`}
                  className="rounded-full bg-dia-mint px-5 py-2 font-mono text-[12px] font-bold tracking-[0.48px] text-black"
                >
                  OPEN MAP →
                </Link>
              </>
            ) : null}
            <StatusBadge status={run.status} />
          </div>
        </header>

        {run.error ? (
          <section className="mt-8 rounded-2xl border border-dia-pink/40 bg-dia-pink/10 p-6">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.48px] text-dia-pink">
              Failure
            </h2>
            <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-[12px] text-dia-fg-muted">
              {run.error}
            </pre>
          </section>
        ) : null}

        <CostSection
          usage={run.usage}
          model={(run.params.model ?? "claude-sonnet-4-6") as ModelId}
        />

        <Section title="Pipeline parameters">
          <pre className="overflow-x-auto rounded-lg border border-dia-border-strong bg-dia-surface-2 p-4 font-mono text-[12px] text-dia-fg-muted">
            {JSON.stringify(run.params, null, 2)}
          </pre>
        </Section>

        <StageGrid
          stages={
            isQuestionGuided
              ? [
                  { key: "extracting", logKey: "extract", label: "Stage 1 — Claims per question", url: distilledSigned },
                  { key: "extracting", logKey: "extract", label: "Selected sub-questions (cruxes)", url: questionsSigned },
                  { key: "relating", logKey: "relate", label: "Stage 2 — Connections (transcript-grounded)", url: relationsSigned },
                ]
              : [
                  { key: "transcribing", logKey: "transcribe", label: "Transcript", url: transcriptSigned },
                  { key: "extracting", logKey: "extract", label: "Stage 1 — Raw claims", url: rawClaimsSigned },
                  { key: "distilling", logKey: "distill", label: "Stage 2 — Distilled", url: distilledSigned },
                  { key: "organizing", logKey: "organize", label: "Stage 3 — Questions", url: questionsSigned },
                  { key: "relating", logKey: "relate", label: "Stage 4 — Relations + momentum", url: relationsSigned },
                  { key: "fact_checking", logKey: "fact_check", label: "Fact-check todos", url: factCheckSigned },
                ]
          }
          status={run.status}
          log={run.log ?? []}
        />

        <Section title="Run inspection">
          <div className="grid grid-cols-2 gap-4">
            <details className="rounded-lg border border-dia-border-strong bg-dia-surface p-4">
              <summary className="cursor-pointer font-mono text-[12px] text-dia-fg-muted hover:text-dia-fg">
                Raw transcript{transcript ? ` (${transcript.length.toLocaleString()} chars)` : " — not available yet"}
              </summary>
              {transcript ? (
                <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-dia-fg-muted">
                  {transcript}
                </pre>
              ) : null}
            </details>

            <details className="rounded-lg border border-dia-border-strong bg-dia-surface p-4">
              <summary className="cursor-pointer font-mono text-[12px] text-dia-fg-muted hover:text-dia-fg">
                Activity log
                {run.log?.length ? ` (${run.log.length})` : ""}
              </summary>
              {run.log?.length ? (
                <ul className="mt-3 max-h-[480px] space-y-1 overflow-auto font-mono text-[11px] leading-relaxed">
                  {[...run.log].reverse().map((entry, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 text-dia-fg-dim">
                        {new Date(entry.at).toLocaleTimeString()}
                      </span>
                      <span className="shrink-0 w-[80px] text-dia-blue">
                        {entry.stage}
                      </span>
                      <span className="text-dia-fg-muted">{entry.message}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 font-mono text-[11px] text-dia-fg-dim">
                  No log entries yet — workflow hasn&apos;t emitted anything.
                </p>
              )}
            </details>
          </div>
        </Section>

        {!isQuestionGuided && rawClaimsArr.length > 0 ? (
          <Section title={`Stage 1 — raw claims (${rawClaimsArr.length})`}>
            <details>
              <summary className="cursor-pointer font-mono text-[12px] text-dia-fg-muted hover:text-dia-fg">
                Show raw claims
              </summary>
              <ul className="mt-3 space-y-2 font-mono text-[13px] text-dia-fg-muted">
                {rawClaimsArr.map((c, i) => (
                  <li
                    key={i}
                    className="rounded border border-dia-border-strong bg-dia-surface p-3"
                  >
                    {c.text}
                  </li>
                ))}
              </ul>
            </details>
          </Section>
        ) : null}

        {distilled?.claims?.length ? (
          <Section
            title={
              isQuestionGuided
                ? `Stage 1 — claims per question (${distilled.claims.length})`
                : `Stage 2 — distilled claims (${distilled.claims.length})`
            }
            subtitle={
              isQuestionGuided
                ? "Claims pulled directly from the transcript for each curator-selected sub-question. IDs are namespaced per question (q1c1, q1c2, …)."
                : "Highest-value human-review step. `absorbed` shows the restatements collapsed into each canonical claim — audit every merge here."
            }
          >
            <ul className="space-y-3">
              {distilled.claims.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-dia-border-strong bg-dia-surface p-4"
                >
                  <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.4px] text-dia-fg-dim">
                    <span>{c.id}</span>
                    {c.is_factual ? (
                      <span className="rounded-full bg-dia-blue/15 px-2 py-0.5 text-dia-blue">
                        factual
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[14px] text-dia-fg">{c.text}</p>
                  {c.absorbed && c.absorbed.length > 0 ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.4px] text-dia-fg-dim hover:text-dia-fg-muted">
                        absorbed ({c.absorbed.length})
                      </summary>
                      <ul className="mt-2 space-y-1 border-l border-dia-border-strong pl-3 font-mono text-[12px] text-dia-fg-muted">
                        {c.absorbed.map((a, i) => (
                          <li key={i}>· {a}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {questions?.central_questions?.length ? (
          <Section
            title={
              isQuestionGuided
                ? `Cruxes — curator-selected (${questions.central_questions.length})`
                : `Stage 3 — central questions (${questions.central_questions.length})`
            }
          >
            <ul className="space-y-2">
              {questions.central_questions.map((q) => (
                <li
                  key={q.id}
                  className="rounded-lg border border-dia-border-strong bg-dia-surface p-4"
                >
                  <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.4px] text-dia-fg-dim">
                    <span>{q.id}</span>
                    <span>{q.claim_ids.length} claims</span>
                  </div>
                  <p className="mt-2 text-[14px] text-dia-fg">{q.question}</p>
                  <p className="mt-2 font-mono text-[12px] text-dia-fg-dim">
                    → {q.claim_ids.join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {relations?.relationships?.length ? (
          <Section
            title={
              isQuestionGuided
                ? `Stage 2 — connections (${relations.relationships.length})`
                : `Stage 4 — within-question relationships (${relations.relationships.length})`
            }
            subtitle={
              isQuestionGuided
                ? "Each connection is a short verb phrase (≤10 words) describing how `from` acts on `to`. No category labels."
                : "Each edge carries a palette label (the kind) and a one-sentence note (the specific way this relationship holds). Audit the notes — empty or restate-the-label notes mean the pipeline didn't earn the edge."
            }
          >
            <ul className="space-y-2">
              {relations.relationships.map((r, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-dia-border-strong bg-dia-surface p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.4px] text-dia-fg-dim">
                    <span>{r.question_id}</span>
                    <span>·</span>
                    <span className="text-dia-fg">{r.from}</span>
                    <span>→</span>
                    <span className="text-dia-fg">{r.to}</span>
                    {!isQuestionGuided && r.type ? (
                      <span className="ml-auto rounded-full bg-dia-mint/15 px-2 py-0.5 normal-case text-dia-mint">
                        {r.type}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className={
                      isQuestionGuided
                        ? "mt-2 text-[14px] text-dia-fg"
                        : "mt-2 text-[13px] text-dia-fg-muted"
                    }
                  >
                    {r.note}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {relations?.cross_question_relationships?.length ? (
          <Section
            title={`Stage 4 — cross-question relationships (${relations.cross_question_relationships.length})`}
          >
            <ul className="space-y-2">
              {relations.cross_question_relationships.map((r, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-dia-border-strong bg-dia-surface p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.4px] text-dia-fg-dim">
                    <span className="text-dia-fg">{r.from}</span>
                    <span>→</span>
                    <span className="text-dia-fg">{r.to}</span>
                    {!isQuestionGuided && r.type ? (
                      <span className="ml-auto rounded-full bg-dia-blue/15 px-2 py-0.5 normal-case text-dia-blue">
                        {r.type}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className={
                      isQuestionGuided
                        ? "mt-2 text-[14px] text-dia-fg"
                        : "mt-2 text-[13px] text-dia-fg-muted"
                    }
                  >
                    {r.note}
                  </p>
                  {r.shared_claim_ids.length > 0 ? (
                    <p className="mt-1 font-mono text-[11px] text-dia-fg-dim">
                      shared claims: {r.shared_claim_ids.join(", ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {!isQuestionGuided && relations?.momentum ? (
          <Section title="Momentum lens">
            <div className="rounded-lg border border-dia-border-strong bg-dia-surface p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.4px] text-dia-fg-dim">
                Highest-leverage question
              </p>
              <p className="mt-1 text-dia-fg">
                {relations.momentum.highest_leverage_question}
              </p>
              <p className="mt-3 font-mono text-[12px] text-dia-fg-muted">
                {relations.momentum.rationale}
              </p>

              {relations.momentum.latent_agreements.length > 0 ? (
                <div className="mt-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.4px] text-dia-fg-dim">
                    Latent agreements
                  </p>
                  <ul className="mt-2 space-y-2">
                    {relations.momentum.latent_agreements.map((a, i) => (
                      <li
                        key={i}
                        className="rounded border border-dia-border-strong bg-dia-surface-2 p-3 font-mono text-[12px] text-dia-fg-muted"
                      >
                        <div className="text-dia-fg">{a.note}</div>
                        <div className="mt-1 text-dia-fg-dim">
                          claims: {a.claim_ids.join(", ")}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

        {factCheck?.fact_check_todos?.length ? (
          <Section
            title={`Fact-check todos (${factCheck.fact_check_todos.length})`}
            subtitle="Separate side layer — does NOT modify the map. These flag empirically checkable claims for a human researcher."
          >
            <ul className="space-y-2">
              {factCheck.fact_check_todos.map((t) => (
                <li
                  key={t.claim_id}
                  className="rounded-lg border border-dia-border-strong bg-dia-surface p-4"
                >
                  <div className="font-mono text-[11px] uppercase tracking-[0.4px] text-dia-fg-dim">
                    {t.claim_id}
                  </div>
                  <p className="mt-1 text-[14px] text-dia-fg">{t.claim_text}</p>
                  <p className="mt-2 font-mono text-[12px] text-dia-fg-muted">
                    → {t.what_to_check}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </main>
    </div>
  );
}

function CostSection({
  usage,
  model,
}: {
  usage: import("@/lib/ai/runQueries").StoredUsage | null;
  model: ModelId;
}) {
  const empty = !usage || usage.total.inputTokens + usage.total.outputTokens === 0;
  const stages = [
    "extract",
    "distill",
    "organize",
    "relate",
    "fact_check",
  ] as const;

  return (
    <Section
      title="Cost so far"
      subtitle="Running USD tally based on per-stage token counts and the model's list price. Reasoning tokens are billed at the output rate."
    >
      <div className="rounded-2xl border border-dia-border-strong bg-dia-surface p-6">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.48px] text-dia-fg-dim">
              Total
            </div>
            <div className="mt-1 font-mono text-[36px] tracking-[-0.5px] text-dia-fg">
              {empty ? "—" : formatUsd(usage!.totalUsd)}
            </div>
          </div>
          <div className="text-right font-mono text-[11px] text-dia-fg-dim">
            <div>model</div>
            <div className="mt-1 text-dia-fg-muted">{model}</div>
          </div>
        </div>

        {!empty ? (
          <table className="mt-6 w-full text-left font-mono text-[12px]">
            <thead className="text-[11px] uppercase tracking-[0.4px] text-dia-fg-dim">
              <tr>
                <th className="py-2">Stage</th>
                <th className="py-2 text-right">Input</th>
                <th className="py-2 text-right">Cached</th>
                <th className="py-2 text-right">Output</th>
                <th className="py-2 text-right">Reasoning</th>
                <th className="py-2 text-right">USD</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => {
                const u = usage!.perStage[s];
                if (!u) {
                  return (
                    <tr
                      key={s}
                      className="border-t border-dia-border-strong text-dia-fg-dim"
                    >
                      <td className="py-2">{s}</td>
                      <td className="py-2 text-right">—</td>
                      <td className="py-2 text-right">—</td>
                      <td className="py-2 text-right">—</td>
                      <td className="py-2 text-right">—</td>
                      <td className="py-2 text-right">—</td>
                    </tr>
                  );
                }
                return (
                  <tr
                    key={s}
                    className="border-t border-dia-border-strong text-dia-fg-muted"
                  >
                    <td className="py-2 text-dia-fg">{s}</td>
                    <td className="py-2 text-right">
                      {u.inputTokens.toLocaleString()}
                    </td>
                    <td className="py-2 text-right">
                      {u.cachedInputTokens.toLocaleString()}
                    </td>
                    <td className="py-2 text-right">
                      {u.outputTokens.toLocaleString()}
                    </td>
                    <td className="py-2 text-right">
                      {u.reasoningTokens.toLocaleString()}
                    </td>
                    <td className="py-2 text-right text-dia-fg">
                      {formatUsd(costUsd(u, model))}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-dia-border-strong text-dia-fg">
                <td className="py-2 font-bold">total</td>
                <td className="py-2 text-right">
                  {usage!.total.inputTokens.toLocaleString()}
                </td>
                <td className="py-2 text-right">
                  {usage!.total.cachedInputTokens.toLocaleString()}
                </td>
                <td className="py-2 text-right">
                  {usage!.total.outputTokens.toLocaleString()}
                </td>
                <td className="py-2 text-right">
                  {usage!.total.reasoningTokens.toLocaleString()}
                </td>
                <td className="py-2 text-right font-bold">
                  {formatUsd(usage!.totalUsd)}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="mt-4 font-mono text-[12px] text-dia-fg-dim">
            No LLM stages have completed yet.
          </p>
        )}
      </div>
    </Section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const ok = status === "succeeded";
  const bad = status === "failed";
  return (
    <span
      className={
        ok
          ? "rounded-full bg-dia-mint/15 px-3 py-1 font-mono text-[12px] text-dia-mint"
          : bad
            ? "rounded-full bg-dia-pink/15 px-3 py-1 font-mono text-[12px] text-dia-pink"
            : "rounded-full bg-dia-blue/15 px-3 py-1 font-mono text-[12px] text-dia-blue"
      }
    >
      {status}
    </span>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-mono text-[12px] uppercase tracking-[0.52px] text-dia-fg-muted">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-1 max-w-[820px] font-mono text-[12px] text-dia-fg-dim">
          {subtitle}
        </p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const STAGE_ORDER = [
  "queued",
  "transcribing",
  "extracting",
  "distilling",
  "organizing",
  "relating",
  "fact_checking",
  "mapping",
  "succeeded",
];

function StageGrid({
  stages,
  status,
  log,
}: {
  stages: {
    key: string;
    logKey: string;
    label: string;
    url: string | null;
  }[];
  status: string;
  log: { at: string; stage: string; message: string }[];
}) {
  const currentIdx = STAGE_ORDER.indexOf(status);
  // For each stage, find the most recent log entry that names it. This is the
  // "how far along" line — for Stage 1 it's "chunk 3/5", for others it's the
  // entry / exit milestone.
  const latestByLogKey: Record<string, string | null> = {};
  for (const s of stages) latestByLogKey[s.logKey] = null;
  for (const entry of log) {
    if (entry.stage in latestByLogKey) latestByLogKey[entry.stage] = entry.message;
  }

  return (
    <Section title="Stages">
      <ol className="grid grid-cols-3 gap-3">
        {stages.map((s, listIdx) => {
          const idx = STAGE_ORDER.indexOf(s.key);
          const done = s.url || (currentIdx >= 0 && idx >= 0 && currentIdx > idx);
          const active = status === s.key;
          const subStatus = latestByLogKey[s.logKey];
          // Use the list position as the React key — `s.key` aliases the
          // status enum and can repeat across cards that share a status
          // (e.g. question-guided writes both `distilled_path` and
          // `questions_path` during a single `extracting` status).
          return (
            <li
              key={listIdx}
              className={
                "rounded-lg border p-4 " +
                (done
                  ? "border-dia-mint/40 bg-dia-mint/5"
                  : active
                    ? "border-dia-blue/40 bg-dia-blue/5"
                    : "border-dia-border-strong bg-dia-surface")
              }
            >
              <div className="font-mono text-[11px] uppercase tracking-[0.4px] text-dia-fg-dim">
                {s.key.replace("_", " ")}
              </div>
              <div className="mt-1 text-[13px] text-dia-fg">{s.label}</div>

              {subStatus ? (
                <div
                  className={
                    "mt-2 font-mono text-[11px] " +
                    (active ? "text-dia-blue" : "text-dia-fg-muted")
                  }
                >
                  {active ? "▶ " : "✓ "}
                  {subStatus}
                </div>
              ) : (
                <div className="mt-2 font-mono text-[11px] text-dia-fg-dim">
                  {active ? "running…" : done ? "—" : "pending"}
                </div>
              )}

              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block font-mono text-[11px] text-dia-mint hover:underline"
                >
                  open raw ↗
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
