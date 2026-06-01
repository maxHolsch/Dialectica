"use client";

import { useRef, useState } from "react";
import { clsx } from "clsx";

const SOURCE_CONTEXT_IMG = "/figma/source-context.png";

/**
 * PRD §5.4 / Figma 40:53 — provenance trigger at the bottom of the side panel.
 *
 * Always-visible: the colorful source-context image (Figma node 40:53).
 * On hover of the image OR pill: a stadium-shaped pill extends to the LEFT
 *   containing "Where was this said?".
 * Hover semantics: 150 ms forgiveness delay on leave; image + pill share a
 *   single hover group so cursor travel between them never tips the leave.
 * Click image OR pill → onActivate (parent expands the side panel into the
 *   heatmap).
 */
export function WhereWasThisSaidTrigger({
  forceVisible = false,
  onActivate,
  className,
}: {
  forceVisible?: boolean;
  onActivate: () => void;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visible = forceVisible || hovered;

  const onEnter = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setHovered(true);
  };
  const onLeave = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setHovered(false), 150);
  };

  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={clsx("flex items-center justify-end", className)}
    >
      {/* Pill text — extends leftward from the image on hover.
          Tucks under the image via negative right margin so the join is seamless. */}
      <button
        type="button"
        onClick={onActivate}
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
        style={{
          height: 40,
          maxWidth: visible ? 280 : 0,
          marginRight: -20,
          backgroundImage: `linear-gradient(#0a0a0a, #0a0a0a), url(${SOURCE_CONTEXT_IMG})`,
          backgroundOrigin: "padding-box, border-box",
          backgroundClip: "padding-box, border-box",
          backgroundSize: "auto, 112% 112%",
          backgroundPosition: "center, center",
          backgroundRepeat: "no-repeat, no-repeat",
        }}
        className={clsx(
          "relative flex flex-shrink items-center overflow-hidden whitespace-nowrap rounded-[4px] border-[1.5px] border-transparent font-mono text-[12px] text-dia-fg transition-[max-width,opacity,padding] duration-200 ease-out",
          visible
            ? "pl-4 pr-7 opacity-100"
            : "pointer-events-none px-0 opacity-0",
        )}
      >
        Where was this said?
      </button>

      {/* The always-visible image button. The only thing rendered when the
          pill is hidden — and the hover target that reveals it. */}
      <button
        type="button"
        onClick={onActivate}
        aria-label="Where was this said?"
        style={{
          width: 60,
          height: 40,
          minWidth: 60,
          flexShrink: 0,
          backgroundImage: `url(${SOURCE_CONTEXT_IMG})`,
          backgroundSize: "112% 112%",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
        className="relative z-10 block rounded-[4px] border-[1.5px] border-transparent"
      />

    </div>
  );
}
