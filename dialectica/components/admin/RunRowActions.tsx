"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Row-level actions on the admin history table: restart (clone + kick off a
// new workflow) and delete (drop the row + storage). Both are POSTs/DELETEs
// against /api/generations/[runId]; the page is server-rendered, so we hit
// router.refresh() afterward to pull the new state in.

export function RunRowActions({
  runId,
  status,
}: {
  runId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"restart" | "delete" | null>(null);
  const inFlight =
    status !== "succeeded" && status !== "failed" && status !== "queued";

  async function onRestart() {
    setBusy("restart");
    try {
      const res = await fetch(`/api/generations/${runId}/restart`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`Restart failed: ${body.error ?? res.status}`);
        setBusy(null);
        return;
      }
      const { runId: newRunId } = (await res.json()) as { runId: string };
      router.push(`/admin/runs/${newRunId}`);
    } catch (e) {
      alert(`Restart failed: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(null);
    }
  }

  async function onDelete() {
    if (
      !confirm(
        `Delete ${runId}? This removes the run row and all its stage blobs. ` +
          `The generated map (if any) stays — delete it separately from the homepage.`,
      )
    ) {
      return;
    }
    setBusy("delete");
    try {
      const res = await fetch(`/api/generations/${runId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`Delete failed: ${body.error ?? res.status}`);
        setBusy(null);
        return;
      }
      router.refresh();
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onRestart}
        disabled={!!busy || inFlight}
        title={
          inFlight
            ? "Wait for the current run to finish or fail before restarting"
            : "Start a new run with the same source + params"
        }
        className="rounded-full border border-dia-border-strong px-3 py-1 text-[11px] tracking-[0.4px] text-dia-fg-muted hover:text-dia-fg disabled:opacity-40"
      >
        {busy === "restart" ? "…" : "RESTART"}
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={!!busy}
        className="rounded-full border border-dia-border-strong px-3 py-1 text-[11px] tracking-[0.4px] text-dia-pink hover:bg-dia-pink/10 disabled:opacity-40"
      >
        {busy === "delete" ? "…" : "DELETE"}
      </button>
    </div>
  );
}
