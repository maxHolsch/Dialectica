"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pencil,
  Pen,
  Highlighter,
  Type,
  Eraser,
  Undo2,
  Redo2,
  Move,
  MousePointer2,
  ChevronRight,
  ChevronDown,
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
import {
  LAYOUT_STRATEGIES,
  DEFAULT_STRATEGY,
  type LayoutStrategyId,
} from "@/lib/layout/strategies";

type Props = {
  mapId: string;
  /** Edit-mode users see the white swatch + the ADD CLAIM pill. */
  isEditMode: boolean;
  /** Triggered when edit-mode user clicks ADD CLAIM. Phase 3 wires to addCrux. */
  onAddClaim?: () => void;
  /**
   * Triggered when edit-mode user picks an auto-format strategy. Returns a
   * Promise so the button can show a busy state until the canvas refreshes.
   */
  onAutoFormat?: (strategy: LayoutStrategyId) => void | Promise<void>;
};

/**
 * Floating bottom-center toolbar.
 * Layout matches Figma node 12:127 (edit) / 5:48 (view):
 *   [pencil][pen][highlighter][text]  |  [✥][✎][●]  |  [swatches]  |  [eraser][undo][redo]  |  (edit) [+ ADD CLAIM]
 */
export function EditToolbar({
  mapId,
  isEditMode,
  onAddClaim,
  onAutoFormat,
}: Props) {
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

  return (
    <div className="pointer-events-none absolute bottom-7 left-1/2 z-20 h-14 -translate-x-1/2 select-none">
      {/* Collapsed state: small round pencil button (Figma node 4:246) */}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Show annotation tools"
        aria-expanded={expanded}
        className={clsx(
          "absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-dia-border bg-[#111] text-dia-fg-muted transition-[transform,opacity] duration-200 ease-out",
          expanded
            ? "pointer-events-none scale-75 opacity-0"
            : "pointer-events-auto scale-100 opacity-100 hover:bg-dia-surface-2 hover:text-dia-fg",
        )}
      >
        <Pencil className="size-4" strokeWidth={1.5} />
      </button>

      {/* Expanded state: full toolbar, anchored to the same center as the button */}
      <div
        className={clsx(
          "absolute left-1/2 top-1/2 flex h-14 origin-center -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-dia-border bg-[#111] px-2 transition-[transform,opacity] duration-200 ease-out",
          expanded
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-75 opacity-0",
        )}
        aria-hidden={!expanded}
      >
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

        {/* Edit-mode only: yellow move cursor — click & drag nodes/edges/labels */}
        {isEditMode && (
          <button
            type="button"
            onClick={() => setMode(mode === "move" ? "select" : "move")}
            aria-label="Move nodes and edges"
            aria-pressed={mode === "move"}
            className={clsx(
              "flex size-9 items-center justify-center rounded-full transition-colors",
              mode === "move"
                ? "bg-[#ffc943]/20 text-[#ffc943] ring-1 ring-[#ffc943]"
                : "text-[#ffc943] hover:bg-[#ffc943]/15",
            )}
          >
            <MousePointer2 className="size-4" strokeWidth={1.75} />
          </button>
        )}
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
            {onAutoFormat ? <AutoFormatMenu onPick={onAutoFormat} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function AutoFormatMenu({
  onPick,
}: {
  onPick: (strategy: LayoutStrategyId) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastStrategy, setLastStrategy] =
    useState<LayoutStrategyId>(DEFAULT_STRATEGY);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape so the menu doesn't trap focus.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handlePick = useCallback(
    async (strategy: LayoutStrategyId) => {
      setOpen(false);
      setBusy(true);
      setLastStrategy(strategy);
      try {
        await onPick(strategy);
      } finally {
        setBusy(false);
      }
    },
    [onPick],
  );

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-full border border-dashed border-[#ffc943] px-3 py-1.5 font-mono text-[11px] font-medium tracking-wide text-[#ffc943] transition-colors hover:bg-[#ffc943]/10 disabled:opacity-50"
      >
        {busy ? "FORMATTING…" : "AUTO-FORMAT"}
        <ChevronDown className="size-3" strokeWidth={2} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute bottom-full right-0 mb-2 min-w-[220px] rounded-lg border border-dia-border bg-[#111] p-1 shadow-lg"
        >
          {Object.values(LAYOUT_STRATEGIES).map((s) => (
            <button
              key={s.id}
              role="menuitem"
              type="button"
              onClick={() => handlePick(s.id)}
              className={clsx(
                "block w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-dia-surface-2",
                s.id === lastStrategy ? "text-[#ffc943]" : "text-dia-fg-muted",
              )}
            >
              <div className="font-mono text-[11px] tracking-wide">
                {s.label}
                {s.id === lastStrategy ? "  ·  last used" : ""}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-dia-fg-dim">
                {s.description}
              </div>
            </button>
          ))}
        </div>
      ) : null}
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
