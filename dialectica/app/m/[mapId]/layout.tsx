import { notFound } from "next/navigation";
import { getMap } from "@/lib/data/maps";
import { currentUser, avatarFor } from "@/lib/data/users";
import { listAnnotationsForMap } from "@/lib/data/annotations";
import { CruxCanvas } from "@/components/crux/CruxCanvas";
import { PresenceAvatars } from "@/components/canvas/PresenceAvatars";
import { LivePill } from "@/components/topbar/LivePill";
import { getArtifactVisitor } from "@/lib/artifact";

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
  const [map, user, annotations, artifactVisitor] = await Promise.all([
    getMap(mapId),
    currentUser(),
    listAnnotationsForMap(mapId),
    getArtifactVisitor(mapId),
  ]);
  if (!map) notFound();
  // Artifact-mode visitors aren't real Supabase users; synthesize an AppUser-
  // shaped identity from the unlock cookie so presence and on-canvas attribution
  // can distinguish two people who used the same shared password.
  const effectiveUser = user
    ? user
    : artifactVisitor
      ? {
          id: artifactVisitor.id,
          email: artifactVisitor.email,
          displayName: artifactVisitor.name,
          role: "view" as const,
        }
      : null;
  const avatar = effectiveUser
    ? avatarFor(effectiveUser)
    : { initials: "?", color: "#cdf4d3" };

  return (
    <div className="relative h-screen bg-dia-bg">
      <CruxCanvas
        map={map}
        annotations={annotations}
        userId={effectiveUser?.id ?? "anon"}
        displayName={effectiveUser?.displayName ?? "Anonymous"}
        userColor={avatar.color}
        isEditMode={user?.role === "edit"}
        hideClose={!user}
      />
      <PresenceAvatars
        mapId={mapId}
        userId={user?.id ?? "anon"}
        displayName={user?.displayName ?? "Anonymous"}
      />
      {/* Frame view mounts here as a fixed overlay; null on crux route */}
      {children}
      {effectiveUser ? (
        <div className="pointer-events-auto fixed right-6 top-5 z-[60]">
          <LivePill
            channelKey={`map:${mapId}`}
            userId={effectiveUser.id}
            displayName={effectiveUser.displayName}
          />
        </div>
      ) : null}
    </div>
  );
}
