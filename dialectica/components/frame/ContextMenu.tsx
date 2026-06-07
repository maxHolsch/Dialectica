"use client";

import { useEffect, useRef, useState } from "react";
import { StakeButton } from "./StakeButton";

export type NodeContextMenuState = {
  mapId: string;
  /** undefined for crux tiles, which have no frame-level staking. */
  frameId?: string;
  nodeId: string;
  selfStaked: boolean;
  nodeText: string;
  x: number;
  y: number;
};

export function NodeContextMenu({
  state,
  onClose,
  onDelete,
  onRenameNode,
}: {
  state: NodeContextMenuState | null;
  onClose: () => void;
  onDelete?: (nodeId: string) => void;
  onRenameNode?: (nodeId: string, text: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!state) {
      setIsEditing(false);
      return;
    }
    const onDocClick = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
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

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  if (!state) return null;

  function handleEditClick() {
    setDraftText(state!.nodeText);
    setIsEditing(true);
  }

  function handleSave() {
    if (draftText.trim() && draftText.trim() !== state!.nodeText) {
      onRenameNode?.(state!.nodeId, draftText.trim());
    } else {
      onClose();
    }
  }

  return (
    <div
      className="fixed z-50 w-64 overflow-hidden rounded-md border border-dia-border bg-[#0a0a0a] py-1 shadow-2xl"
      style={{ left: state.x, top: state.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {isEditing ? (
        <div className="flex flex-col gap-2 px-3 py-2">
          <textarea
            ref={textareaRef}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
              if (e.key === "Escape") { e.stopPropagation(); onClose(); }
            }}
            rows={4}
            className="w-full resize-none rounded border border-dia-border bg-dia-surface-2 px-2 py-1.5 font-mono text-[12px] text-dia-fg outline-none focus:border-[#ffc943]"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 rounded border border-[#ffc943] bg-[#ffc943]/10 px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-[#ffc943] transition-colors hover:bg-[#ffc943]/20"
            >
              Save
            </button>
            <button
              onClick={onClose}
              className="flex-1 rounded border border-dia-border px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-dia-fg-dim transition-colors hover:bg-dia-surface-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {state.frameId && (
            <StakeButton
              mapId={state.mapId}
              frameId={state.frameId}
              nodeId={state.nodeId}
              selfStaked={state.selfStaked}
              variant="menu"
              onToggled={onClose}
            />
          )}
          {onRenameNode && (
            <button
              onClick={handleEditClick}
              className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[12px] text-dia-fg transition-colors hover:bg-dia-surface-2"
            >
              Change text
            </button>
          )}
          {onDelete && (
            <>
              <div className="mx-3 my-1 border-t border-dia-border" />
              <button
                onClick={() => onDelete(state.nodeId)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[12px] text-red-400 transition-colors hover:bg-dia-surface-2"
              >
                Delete node
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
