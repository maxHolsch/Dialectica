"use client";

import type { ArgMap, Frame, Annotation } from "@/lib/schema";
import type { StakeMap } from "@/lib/data/stakes-types";
import { FrameCanvas } from "./FrameCanvas";
import { SidePanel } from "./SidePanel";

/**
 * Phase 4 composite — Frame view layout.
 *
 *   <FrameCanvas />   ← flex-1, shrinks if the side panel widens.
 *   <SidePanel />     ← compact 320px ; expanded ~55vw (becomes the heatmap).
 */
export function FrameView({
  map,
  frame,
  annotations,
  userId,
  displayName,
  userColor,
  isEditMode,
  stakes,
}: {
  map: ArgMap;
  frame: Frame;
  annotations: Annotation[];
  userId: string;
  displayName: string;
  userColor: string;
  isEditMode: boolean;
  stakes: StakeMap;
}) {
  return (
    <div className="flex h-full w-full min-w-0">
      <div className="min-w-0 flex-1">
        <FrameCanvas
          map={map}
          frame={frame}
          annotations={annotations}
          userId={userId}
          displayName={displayName}
          userColor={userColor}
          isEditMode={isEditMode}
          stakes={stakes}
        />
      </div>
      <SidePanel map={map} stakes={stakes} isEditMode={isEditMode} />
    </div>
  );
}
