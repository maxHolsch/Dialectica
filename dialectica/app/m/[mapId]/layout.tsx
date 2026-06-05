import { notFound } from "next/navigation";
import { getMap } from "@/lib/data/maps";
import { currentUser, avatarFor } from "@/lib/data/users";
import { listAnnotationsForMap } from "@/lib/data/annotations";
import { CruxCanvas } from "@/components/crux/CruxCanvas";
import { LivePill } from "@/components/topbar/LivePill";

/**
 * Persistent map layout — the CruxCanvas stays mounted across crux↔frame
 * navigation so navigating back from a frame reveals an already-rendered canvas
 * instantly, with no blank-screen gap.
 */
export default async function MapLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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
    <div className="relative h-screen bg-dia-bg">
      <CruxCanvas
        map={map}
        annotations={annotations}
        userId={user?.id ?? "anon"}
        displayName={user?.displayName ?? "Anonymous"}
        userColor={avatar.color}
        isEditMode={user?.role === "edit"}
        hideClose={!user}
      />
      {/* Frame view mounts here as a fixed overlay; null on crux route */}
      {children}
      {user ? (
        <div className="pointer-events-auto fixed right-6 top-5 z-[60]">
          <LivePill
            channelKey={`map:${mapId}`}
            userId={user.id}
            displayName={user.displayName}
          />
        </div>
      ) : null}
    </div>
  );
}
