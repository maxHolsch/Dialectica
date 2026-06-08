"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import type { ArgMap, Frame, Annotation } from "@/lib/schema";
import type { StakeMap } from "@/lib/data/stakes-types";
import { FrameCanvas } from "./FrameCanvas";
import { SnippetDrawer, SNIPPET_DRAWER_DEFAULT_WIDTH, DRAWER_ANIM_MS } from "./SnippetDrawer";
import { useUIStore } from "@/lib/state/useUIStore";
import { FRAME_EXIT_EVENT, FRAME_EXIT_DONE_EVENT } from "@/lib/navTransition";

const ENTER_MS = 220;
const EXIT_MS = 200;
const CRUX_EXIT_MS = 90; // crux text exits before parent morph has much to collide with

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
  const router = useRouter();
  const [exiting, setExiting] = useState(false);
  const [ready, setReady] = useState(false);
  const drawerOpen = useUIStore((s) => !!s.snippetDrawerNode);
  // Animate header height from crux height (102) up to frame height (128) on enter.
  const [headerH, setHeaderH] = useState(102);
  const morphRafRef = useRef<number>(0);
  useEffect(() => {
    morphRafRef.current = requestAnimationFrame(() => {
      morphRafRef.current = requestAnimationFrame(() => setHeaderH(128));
    });
    return () => cancelAnimationFrame(morphRafRef.current);
  }, []);

  const cruxQuestion =
    frame.cruxId === "top"
      ? map.topQuestion
      : (map.cruxes.find((c) => c.id === frame.cruxId)?.question ?? "");

  function goBack() {
    setExiting(true);
    window.dispatchEvent(new CustomEvent(FRAME_EXIT_EVENT));
    // Reveal the crux-canvas header just before the animation ends so it
    // reaches full opacity at the same moment the parent text does.
    // When FrameView unmounts both texts are at opacity 1 in the same spot —
    // the handoff is invisible.
    setTimeout(
      () => window.dispatchEvent(new CustomEvent(FRAME_EXIT_DONE_EVENT)),
      EXIT_MS - 20,
    );
    setTimeout(() => void router.push(`/m/${map.id}/crux`), EXIT_MS + 20);
  }

  return (
    <>
      {/* Canvas overlay — fades immediately on exit to reveal the already-mounted
          crux canvas underneath. Must be a sibling of the header layer (not its
          parent) so that the header opacity animation is not multiplied by this
          fade and can brighten independently. */}
      <div
        className="fixed inset-0 z-[100] flex min-w-0 bg-dia-bg"
        style={{
          opacity: exiting ? 0 : 1,
          transition: exiting ? `opacity ${EXIT_MS}ms ease-in-out` : 'none',
        }}
      >
        <div className="min-w-0 flex-1 overflow-hidden">
          <FrameCanvas
            map={map}
            frame={frame}
            annotations={annotations}
            userId={userId}
            displayName={displayName}
            userColor={userColor}
            isEditMode={isEditMode}
            stakes={stakes}
            onReady={() => setReady(true)}
          />
        </div>
      </div>

      {/* Header layer — floats above the canvas overlay. No div-level fade;
          each child animation ends at opacity 0 so cleanup is self-contained. */}
      <div className="pointer-events-none fixed inset-0 z-[150]">
        {/* White backing — flat white in the header area, then a long, smooth
            fade so there's no visible edge where it meets the dot grid. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{
            height: headerH,
            backgroundColor: "#131313",
            borderBottom: "1px solid #1C1C1C",
            transition: "height 200ms ease-in-out",
          }}
        />

        {/* Back button */}
        <button
          onClick={goBack}
          aria-label="Back to map"
          className="pointer-events-auto absolute flex items-center justify-center rounded-full bg-white"
          style={{ top: 32, left: 32, width: 48, height: 48, border: "1px solid #EEEEEE" }}
        >
          <ArrowLeft size={18} weight="regular" />
        </button>

        {/* Two-line header */}
        <div
          className="pointer-events-none absolute left-0 flex flex-col items-center overflow-hidden"
          style={{
            top: 36,
            gap: 5,
            right: drawerOpen ? SNIPPET_DRAWER_DEFAULT_WIDTH : 0,
            transition: `right ${DRAWER_ANIM_MS}ms ease-out`,
          }}
        >
          {/* Parent question — morphs from small/dim to full-size on exit */}
          <button
            onClick={goBack}
            className="pointer-events-auto cursor-pointer whitespace-nowrap font-serif text-[13px] hover:opacity-70"
            style={
              exiting
                ? { color: "#FFFFFF", background: "none", border: "none", padding: 0,
                    animation: `frame-parent-exit ${EXIT_MS}ms ease-in-out forwards` }
                : ready
                ? { color: "#FFFFFF", background: "none", border: "none", padding: 0,
                    animation: `frame-parent-enter ${ENTER_MS}ms ease-in-out forwards` }
                : { color: "#FFFFFF", background: "none", border: "none", padding: 0,
                    opacity: 1, transform: "scale(1.54) translateY(4px)" }
            }
          >
            {map.topQuestion}
          </button>

          {/* Crux question — rapidly fades out on exit */}
          <p
            className="whitespace-nowrap font-serif text-[20px]"
            style={
              exiting
                ? { color: "#FFFFFF", animation: `frame-crux-exit ${CRUX_EXIT_MS}ms ease-out forwards` }
                : ready
                ? { color: "#FFFFFF", animation: `frame-crux-enter ${ENTER_MS}ms ease-in-out 40ms backwards` }
                : { color: "#FFFFFF", opacity: 0, filter: "blur(8px)", transform: "translateY(6px)" }
            }
          >
            {cruxQuestion}
          </p>
        </div>
      </div>

      {/* Snippet drawer — rendered last so its z-[310] beats the header's z-[150]
          without any portal / stacking-context ambiguity. */}
      <SnippetDrawer map={map} />
    </>
  );
}
