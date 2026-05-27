import { notFound } from "next/navigation";
import { getMap } from "@/lib/data/maps";
import { Topbar } from "@/components/topbar/Topbar";
import { FrameCanvas } from "@/components/frame/FrameCanvas";

/** DIA-VIEW-2 — Frame view. Figma node 2:15. */
export default async function FramePage({
  params,
}: {
  params: Promise<{ mapId: string; frameId: string }>;
}) {
  const { mapId, frameId } = await params;
  const map = await getMap(mapId);
  if (!map) notFound();

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
        avatars={[
          { initials: "EM", color: "#cdf4d3" },
          { initials: "JS", color: "#ffc2ec" },
        ]}
      />
      <main className="flex-1">
        <FrameCanvas map={map} frame={frame} />
      </main>
    </div>
  );
}
