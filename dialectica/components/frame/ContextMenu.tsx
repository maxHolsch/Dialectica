"use client";

import { useEffect } from "react";
import { StakeButton } from "./StakeButton";

export type NodeContextMenuState = {
  mapId: string;
  frameId: string;
  nodeId: string;
  selfStaked: boolean;
  x: number;
  y: number;
};

/**
 * Right-click menu for a claim node (Figma side-panel shortcut + PRD §10.1).
 * Renders only the stake toggle today; more actions can land here without a
 * structural change (e.g. "Open in heatmap", "Copy link to claim").
 */
export function NodeContextMenu({
  state,
  onClose,
}: {
  state: NodeContextMenuState | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!state) return;
    const onDocClick = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Defer so the click that opened us doesn't immediately close it.
    const id = requestAnimationFrame(() => {
      window.addEventListener("click", onDocClick);
      window.addEventListener("keydown", onKey);
    });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("click", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [state, onClose]);

  if (!state) return null;

  return (
    <div
      className="fixed z-50 w-56 overflow-hidden rounded-md border border-dia-border bg-[#0a0a0a] py-1 shadow-2xl"
      style={{ left: state.x, top: state.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <StakeButton
        mapId={state.mapId}
        frameId={state.frameId}
        nodeId={state.nodeId}
        selfStaked={state.selfStaked}
        variant="menu"
        onToggled={onClose}
      />
    </div>
  );
}
