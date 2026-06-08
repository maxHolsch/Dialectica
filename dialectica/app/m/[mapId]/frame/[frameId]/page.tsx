import { notFound } from "next/navigation";
import { getMap } from "@/lib/data/maps";
import { currentUser, avatarFor } from "@/lib/data/users";
import { listStakesForMap } from "@/lib/data/stakes";
import { mergeSyntheticStakes } from "@/lib/data/synthetic-stakes";
import { listAnnotationsForMap } from "@/lib/data/annotations";
import { FrameView } from "@/components/frame/FrameView";

/** DIA-VIEW-2 — Frame view. Figma node 2:15. */
export default async function FramePage({
  params,
}: {
  params: Promise<{ mapId: string; frameId: string }>;
}) {
  const { mapId, frameId } = await params;
  const [map, user, stakes, annotations] = await Promise.all([
    getMap(mapId),
    currentUser(),
    listStakesForMap(mapId),
    listAnnotationsForMap(mapId),
  ]);
  if (!map) notFound();
  const mergedStakes = mergeSyntheticStakes(map, stakes, user?.id ?? "");
  const avatar = user ? avatarFor(user) : { initials: "?", color: "#cdf4d3" };

  const frame = map.frames[frameId];
  if (!frame) notFound();

  const cruxQuestion =
    frame.cruxId === "top"
      ? map.topQuestion
      : (map.cruxes.find((c) => c.id === frame.cruxId)?.question ?? "");

  return (
    <FrameView
      map={map}
      frame={frame}
      annotations={annotations}
      userId={user?.id ?? "anon"}
      displayName={user?.displayName ?? "Anonymous"}
      userColor={avatar.color}
      isEditMode={user?.role === "edit"}
      stakes={mergedStakes}
    />
  );
}
