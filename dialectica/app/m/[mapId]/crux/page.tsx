import { notFound } from "next/navigation";
import { getMap } from "@/lib/data/maps";
import { Topbar } from "@/components/topbar/Topbar";
import { CruxCanvas } from "@/components/crux/CruxCanvas";

/** DIA-VIEW-1 — Crux view. Figma node 2:9. */
export default async function CruxPage({
  params,
}: {
  params: Promise<{ mapId: string }>;
}) {
  const { mapId } = await params;
  const map = await getMap(mapId);
  if (!map) notFound();

  return (
    <div className="flex h-screen flex-col bg-dia-bg">
      <Topbar
        crumbs={[
          { kind: "brand", label: "DIALECTIA" },
          { kind: "sep-slash" },
          { kind: "medium", label: map.title },
          { kind: "sep-arrow" },
          { kind: "dim", label: "Crux map" },
        ]}
        pill={{ kind: "live", count: 2 }}
        avatars={[
          { initials: "EM", color: "#cdf4d3" },
          { initials: "JS", color: "#ffc2ec" },
        ]}
      />
      <main className="flex-1">
        <CruxCanvas map={map} />
      </main>
    </div>
  );
}
