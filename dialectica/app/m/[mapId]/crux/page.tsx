import { notFound } from "next/navigation";
import { getMap } from "@/lib/data/maps";
import { currentUser, avatarFor } from "@/lib/data/users";
import { listAnnotationsForMap } from "@/lib/data/annotations";
import { Topbar } from "@/components/topbar/Topbar";
import { CruxCanvas } from "@/components/crux/CruxCanvas";

/** DIA-VIEW-1 — Crux view. Figma node 2:9. */
export default async function CruxPage({
  params,
}: {
  params: Promise<{ mapId: string }>;
}) {
  const { mapId } = await params;
  const [map, user, annotations] = await Promise.all([
    getMap(mapId),
    currentUser(),
    listAnnotationsForMap(mapId),
  ]);
  if (!map) notFound();
  const avatar = user ? avatarFor(user) : { initials: "?", color: "#cdf4d3" };

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
        avatars={[avatar]}
      />
      <main className="flex-1">
        <CruxCanvas
          map={map}
          annotations={annotations}
          userId={user?.id ?? "anon"}
          isEditMode={user?.role === "edit"}
        />
      </main>
    </div>
  );
}
