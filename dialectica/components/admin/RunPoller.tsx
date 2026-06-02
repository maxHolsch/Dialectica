"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Polls the run's status every 3s while the workflow is still running. As soon
// as the response reports a terminal state (succeeded / failed), the component
// triggers a router.refresh() so the server-rendered page reloads with the new
// stage URLs and JSON. The page itself does not re-mount RunPoller in the
// terminal state (the parent skips rendering it), so polling stops naturally.

export function RunPoller({ runId }: { runId: string }) {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/generations/${runId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          run: { status: string } | null;
        };
        if (cancelled) return;
        router.refresh();
        if (
          body.run?.status === "succeeded" ||
          body.run?.status === "failed"
        ) {
          clearInterval(id);
        }
      } catch {
        // swallow — next tick retries
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [router, runId]);
  return null;
}
