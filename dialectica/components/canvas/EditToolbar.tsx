"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Pencil,
  Pen,
  Highlighter,
  Type,
  Eraser,
  Undo2,
  Redo2,
  Move,
  ChevronRight,
} from "lucide-react";
import { clsx } from "clsx";
import {
  useUIStore,
  SWATCHES,
  type DrawingTool,
  type CanvasMode,
} from "@/lib/state/useUIStore";
import {
  createAnnotation,
  deleteAnnotation,
} from "@/lib/data/mutations";

type Props = {
  mapId: string;
  /** Edit-mode users see the white swatch + the ADD CLAIM pill. */
  isEditMode: boolean;
  /** Triggered when edit-mode user clicks ADD CLAIM. Phase 3 wires to addCrux. */
  onAddClaim?: () => void;
};

/**
 * Floating bottom-center toolbar.
 * Layout matches Figma node 12:127 (edit) / 5:48 (view):
 *   [pencil][pen][highlighter][text]  |  [✥][✎][●]  |  [swatches]  |  [eraser][undo][redo]  |  (edit) [+ ADD CLAIM]
 */
export function EditToolbar({ mapId, isEditMode, onAddClaim }: Props) {
  const mode = useUIStore((s) => s.mode);
  const tool = useUIStore((s) => s.tool);
  const color = useUIStore((s) => s.color);
  const setMode = useUIStore((s) => s.setMode);
  const setTool = useUIStore((s) => s.setTool);
  const setColor = useUIStore((s) => s.setColor);
  const undo = useUIStore((s) => s.undo);
  const redo = useUIStore((s) => s.redo);
  const addOptimistic = useUIStore((s) => s.addOptimistic);
  const removeOptimistic = useUIStore((s) => s.removeOptimistic);
  // Toolbar starts minimized to a single pencil button (Figma node 4:246).
  // Click to expand the full toolbar; click the collapse button to shrink it again.
  const [expanded, setExpanded] = useState(false);

  const swatches = isEditMode ? SWATCHES : SWATCHES.slice(1);

  const onUndo = useCallback(async () => {
    const action = undo();
    if (!action) return;
    try {
      if (action.type === "create") {
        // Inverse of create: delete
        removeOptimistic(action.annotation.id);
        await deleteAnnotation(mapId, action.annotation.id);
      } else {
        // Inverse of delete: re-add
        addOptimistic(action.annotation);
        await createAnnotation(mapId, action.annotation);
      }
    } catch (err) {
      console.error("[toolbar] undo failed", err);
    }
  }, [undo, mapId, addOptimistic, removeOptimistic]);

  const onRedo = useCallback(async () => {
    const action = redo();
    if (!action) return;
    try {
      if (action.type === "create") {
        addOptimistic(action.annotation);
        await createAnnotation(mapId, action.annotation);
      } else {
        removeOptimistic(action.annotation.id);
        await deleteAnnotation(mapId, action.annotation.id);
      }
    } catch (err) {
      console.error("[toolbar] redo failed", err);
    }
  }, [redo, mapId, addOptimistic, removeOptimistic]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      // Ignore when focus is on an editable element (textbox annotations, future labels).
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
        return;
      }
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        if (e.shiftKey) void onRedo();
        else void onUndo();
      } else if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        void onRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onUndo, onRedo]);

  if (!expanded) {
    return (
      <div className="pointer-events-auto absolute bottom-7 left-1/2 z-20 -translate-x-1/2 select-none">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Show annotation tools"
          aria-expanded={false}
          className="flex size-11 items-center justify-center rounded-full border border-dia-border bg-[#111] text-dia-fg-muted transition-colors hover:bg-dia-surface-2 hover:text-dia-fg"
        >
          <Pencil className="size-4" strokeWidth={1.5} />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute bottom-7 left-1/2 z-20 -translate-x-1/2 select-none">
      <div className="flex h-14 items-center gap-1 rounded-full border border-dia-border bg-[#111] px-2">
        {/* Collapse toolbar */}
        <ModeButton
          onClick={() => setExpanded(false)}
          aria-label="Hide annotation tools"
        >
          <ChevronRight className="size-4 rotate-180" strokeWidth={1.5} />
        </ModeButton>
        <Divider />
        {/* Drawing tools */}
        <ToolButton
          tool="pencil"
          active={mode === "draw" && tool === "pencil"}
          onClick={() => setTool("pencil")}
          aria-label="Pencil"
        >
          <Pencil className="size-4" strokeWidth={1.5} />
        </ToolButton>
        <ToolButton
          tool="pen"
          active={mode === "draw" && tool === "pen"}
          onClick={() => setTool("pen")}
          aria-label="Pen"
        >
          <Pen className="size-4" strokeWidth={1.5} />
        </ToolButton>
        <ToolButton
          tool="highlighter"
          active={mode === "draw" && tool === "highlighter"}
          onClick={() => setTool("highlighter")}
          aria-label="Highlighter"
        >
          <Highlighter className="size-4" strokeWidth={1.5} />
        </ToolButton>
        <ToolButton
          tool="textbox"
          active={mode === "draw" && tool === "textbox"}
          onClick={() => setTool("textbox")}
          aria-label="Text box"
        >
          <Type className="size-4" strokeWidth={1.5} />
        </ToolButton>

        <Divider />

        {/* Mode glyphs ✥ ✎ ● */}
        <ModeButton
          active={mode === "select"}
          onClick={() => setMode("select")}
          aria-label="Select / pan mode"
        >
          <Move className="size-4" strokeWidth={1.5} />
        </ModeButton>
        <ModeButton
          active={mode === "draw"}
          onClick={() => setMode("draw")}
          aria-label="Drawing mode"
        >
          <Pencil className="size-4" strokeWidth={1.5} />
        </ModeButton>
        <span
          aria-label="Current color"
          className="flex size-9 items-center justify-center"
        >
          <span
            className="block size-4 rounded-full border border-dia-border"
            style={{ background: color }}
          />
        </span>

        <Divider />

        {/* Color swatches */}
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`Color ${swatch}`}
            onClick={() => setColor(swatch)}
            className={clsx(
              "flex size-9 items-center justify-center rounded-full transition-colors hover:bg-dia-surface-2",
              color === swatch && "ring-1 ring-[#ffc943]",
            )}
          >
            <span
              className="block size-4 rounded-full border border-dia-border"
              style={{ background: swatch }}
            />
          </button>
        ))}

        <Divider />

        {/* Eraser + undo/redo (additions to the Figma toolbar) */}
        <ModeButton
          active={mode === "erase"}
          onClick={() => setMode("erase")}
          aria-label="Eraser"
        >
          <Eraser className="size-4" strokeWidth={1.5} />
        </ModeButton>
        <ModeButton onClick={onUndo} aria-label="Undo">
          <Undo2 className="size-4" strokeWidth={1.5} />
        </ModeButton>
        <ModeButton onClick={onRedo} aria-label="Redo">
          <Redo2 className="size-4" strokeWidth={1.5} />
        </ModeButton>

        {isEditMode && (
          <>
            <Divider />
            <button
              type="button"
              onClick={onAddClaim}
              className="rounded-full border border-dashed border-[#ffc943] px-3 py-1.5 font-mono text-[11px] font-medium tracking-wide text-[#ffc943] transition-colors hover:bg-[#ffc943]/10"
            >
              + ADD CLAIM
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-7 w-px bg-dia-border" aria-hidden />;
}

function ToolButton({
  active,
  onClick,
  children,
  ...rest
}: {
  tool: DrawingTool;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "flex size-9 items-center justify-center rounded-full transition-colors",
        active
          ? "bg-dia-surface-2 text-dia-fg"
          : "text-dia-fg-muted hover:bg-dia-surface-2 hover:text-dia-fg",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function ModeButton({
  active = false,
  onClick,
  children,
  ...rest
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "flex size-9 items-center justify-center rounded-full transition-colors",
        active
          ? "bg-dia-surface-2 text-dia-fg"
          : "text-dia-fg-muted hover:bg-dia-surface-2 hover:text-dia-fg",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// Surface helper imports so consumers can re-use mode/tool typings.
export type { CanvasMode, DrawingTool };
