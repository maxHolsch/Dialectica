"use client";

import { ArrowCounterClockwise, ArrowClockwise, Broom } from "@phosphor-icons/react";

export function UndoRedoControls({
  canUndo,
  canRedo,
  undoCount,
  redoCount,
  onUndo,
  onRedo,
  onReset,
}: {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
}) {
  return (
    <div
      className="fixed bottom-24 right-6 flex items-center gap-0.5 rounded-full bg-[#1a1a1a] px-1.5 py-1 shadow-lg"
      style={{ zIndex: 160 }}
    >
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title={`Undo${undoCount > 0 ? ` (${undoCount})` : ""} — ⌘Z`}
        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
      >
        <ArrowCounterClockwise size={13} weight="bold" />
        <span className="font-mono">⌘Z</span>
      </button>
      <div className="h-3.5 w-px bg-white/10" />
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title={`Redo${redoCount > 0 ? ` (${redoCount})` : ""} — ⌘⇧Z`}
        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
      >
        <ArrowClockwise size={13} weight="bold" />
        <span className="font-mono">⌘⇧Z</span>
      </button>
      <div className="h-3.5 w-px bg-white/10" />
      <button
        onClick={onReset}
        title="Reset to auto-layout"
        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Broom size={13} />
        <span>Reset</span>
      </button>
    </div>
  );
}
