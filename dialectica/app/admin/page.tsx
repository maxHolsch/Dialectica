import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser, avatarFor } from "@/lib/data/users";
import { Topbar } from "@/components/topbar/Topbar";
import { listRuns } from "@/lib/ai/runQueries";
import { listMaps } from "@/lib/data/maps";
import { NewGenerationForm } from "@/components/admin/NewGenerationForm";
import { SnippetJobForm } from "@/components/admin/SnippetJobForm";
import { RunRowActions } from "@/components/admin/RunRowActions";

// DIA-AI-4 — admin page. Edit-gated. Lists generation runs and exposes the
// "new generation" form (text or .m4a upload, plus tunable knobs).

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/admin");
  if (user.role !== "edit") redirect("/");

  const runs = await listRuns();
  const maps = await listMaps().catch(() => []);
  const avatar = avatarFor(user);

  return (
    <div className="flex min-h-screen flex-col bg-dia-bg">
      <Topbar
        crumbs={[
          { kind: "brand", label: "DIALECTIA", href: "/" },
          { kind: "sep-slash" },
          { kind: "medium", label: "Admin", href: "/admin" },
        ]}
        pill={{ kind: "settings" }}
        avatars={[avatar]}
      />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-12 py-12">
        <h1 className="text-[36px] font-normal tracking-[-0.72px] text-dia-fg">
          Generation runs
        </h1>
        <p className="mt-2 max-w-[820px] font-mono text-[13px] text-dia-fg-dim">
          DIA-AI-4. Upload a transcript or an audio file. Each stage&apos;s
          intermediate JSON is persisted to Vercel Blob and viewable inline on
          the run detail page.
        </p>

        <section className="mt-10 rounded-2xl border border-dia-border-strong bg-dia-surface p-8">
          <h2 className="font-mono text-[12px] uppercase tracking-[0.52px] text-dia-fg-muted">
            New generation
          </h2>
          <NewGenerationForm />
        </section>

        <section className="mt-10 rounded-2xl border border-dia-border-strong bg-dia-surface p-8">
          <h2 className="font-mono text-[12px] uppercase tracking-[0.52px] text-dia-fg-muted">
            Audio snippets
          </h2>
          <p className="mt-2 max-w-[820px] font-mono text-[13px] text-dia-fg-dim">
            Runs after claims exist, before a new map is made. Finds the top-5
            related transcript snippets per claim (with audio timestamps),
            writes them onto the map, and bills to the cost calculator below.
          </p>
          <SnippetJobForm maps={maps.map((m) => ({ id: m.id, title: m.title }))} />
        </section>

        <section className="mt-12">
          <h2 className="font-mono text-[12px] uppercase tracking-[0.52px] text-dia-fg-muted">
            History
          </h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-dia-border-strong">
            <table className="w-full text-left font-mono text-[13px]">
              <thead className="bg-dia-surface-2 text-[11px] uppercase tracking-[0.48px] text-dia-fg-dim">
                <tr>
                  <th className="px-5 py-3">Run</th>
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Map</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-dia-fg-dim"
                    >
                      No runs yet. Start one above.
                    </td>
                  </tr>
                ) : (
                  runs.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-dia-border-strong text-dia-fg-muted"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/runs/${r.id}`}
                          className="text-dia-fg hover:underline"
                        >
                          {r.id}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        {r.source_kind}
                        {r.source_label ? ` · ${r.source_label}` : ""}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="px-5 py-3 text-dia-fg-dim">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        {r.map_id ? (
                          <Link
                            href={`/m/${r.map_id}/crux`}
                            className="text-dia-mint hover:underline"
                          >
                            {r.map_id}
                          </Link>
                        ) : (
                          <span className="text-dia-fg-dim">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <RunRowActions runId={r.id} status={r.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const ok = status === "succeeded";
  const bad = status === "failed";
  const pending = !ok && !bad;
  return (
    <span
      className={
        ok
          ? "rounded-full bg-dia-mint/15 px-2 py-0.5 text-dia-mint"
          : bad
            ? "rounded-full bg-dia-pink/15 px-2 py-0.5 text-dia-pink"
            : "rounded-full bg-dia-blue/15 px-2 py-0.5 text-dia-blue"
      }
    >
      {status}
      {pending ? " …" : ""}
    </span>
  );
}
