import { notFound } from "next/navigation";
import { getMap } from "@/lib/data/maps";
import { currentUser, avatarFor } from "@/lib/data/users";
import { Topbar } from "@/components/topbar/Topbar";
import { FrameCanvas } from "@/components/frame/FrameCanvas";

/** DIA-VIEW-2 — Frame view. Figma node 2:15. */
export default async function FramePage({
  params,
}: {
  params: Promise<{ mapId: string; frameId: string }>;
}) {
  const { mapId, frameId } = await params;
  const [map, user] = await Promise.all([getMap(mapId), currentUser()]);
  if (!map) notFound();
  const avatar = user ? avatarFor(user) : { initials: "?", color: "#cdf4d3" };

  const frame = map.frames[frameId];
  if (!frame) notFound();

  const cruxQuestion =
    frame.cruxId === "top"
      ? map.topQuestion
      : (map.cruxes.find((c) => c.id === frame.cruxId)?.question ?? "");

  return (
    <div className="flex h-screen flex-col bg-dia-bg">
      <Topbar
        crumbs={[
          { kind: "brand", label: "DIALECTIA" },
          { kind: "sep-slash" },
          { kind: "medium", label: map.title },
          { kind: "sep-arrow" },
          { kind: "dim", label: cruxQuestion },
        ]}
        pill={{ kind: "settings" }}
        avatars={[avatar]}
      />
      <main className="flex-1">
        <FrameCanvas
          map={map}
          frame={frame}
          userId={user?.id ?? "anon"}
          isEditMode={user?.role === "edit"}
        />
      </main>
    </div>
  );
}
