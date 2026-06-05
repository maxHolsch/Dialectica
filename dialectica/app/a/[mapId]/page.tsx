import { notFound, redirect } from "next/navigation";
import { isArtifactUnlocked, resolveArtifactSlug } from "@/lib/artifact";
import { unlockArtifact } from "./actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function lookupTitle(mapId: string): Promise<string> {
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("Dialectica_maps")
      .select("title")
      .eq("id", mapId)
      .maybeSingle();
    return (data?.title as string | undefined) ?? mapId;
  } catch {
    return mapId;
  }
}

export default async function ArtifactGatePage({
  params,
  searchParams,
}: {
  params: Promise<{ mapId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { mapId: slug } = await params;
  const { error } = await searchParams;
  const mapId = resolveArtifactSlug(slug);
  if (!mapId) notFound();
  if (await isArtifactUnlocked(mapId)) redirect(`/m/${mapId}/crux`);

  const title = await lookupTitle(mapId);
  const action = unlockArtifact.bind(null, slug);

  return (
    <main className="flex min-h-screen items-center justify-center bg-dia-bg px-6">
      <div className="w-full max-w-[400px]">
        <h1 className="font-mono text-[20px] font-bold tracking-[0.8px] text-dia-fg">
          DIALECTIA
        </h1>
        <p className="mt-1 font-mono text-[13px] text-dia-fg-dim">
          Shared artifact · view only
        </p>
        <p className="mt-6 font-serif text-[22px] leading-tight text-dia-fg">
          {title}
        </p>
        <form action={action} className="mt-8 space-y-4">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-dia-fg-dim">
              Password
            </span>
            <input
              name="password"
              type="password"
              required
              autoFocus
              autoComplete="off"
              className="mt-1 block h-11 w-full rounded-md border border-dia-border-strong bg-dia-bg px-3 font-mono text-[13px] text-dia-fg placeholder:text-dia-fg-dim outline-none focus:border-dia-mint"
            />
          </label>
          {error ? (
            <p className="font-mono text-[12px] text-red-500">
              Incorrect password.
            </p>
          ) : null}
          <button
            type="submit"
            className="h-11 w-full rounded-md bg-dia-fg font-mono text-[13px] text-dia-bg hover:opacity-90"
          >
            View artifact
          </button>
        </form>
      </div>
    </main>
  );
}
