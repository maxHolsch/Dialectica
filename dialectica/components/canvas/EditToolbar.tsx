"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PencilSimple,
  Pen,
  Highlighter,
  Eraser,
  Broom,
  Cursor,
  TextT,
  Hand,
  HandGrabbing,
} from "@phosphor-icons/react";
import { clsx } from "clsx";
import {
  useUIStore,
  SWATCHES,
  TEXT_FONT_SIZES,
  type DrawingTool,
  type CanvasMode,
  type TextFontSize,
} from "@/lib/state/useUIStore";
import { CURSORS } from "@/lib/canvas/cursors";
import {
  createAnnotation,
  deleteAnnotation,
} from "@/lib/data/mutations";
type Props = {
  mapId: string;
  isEditMode: boolean;
  onAddClaim?: () => void;
  onAutoFormat?: () => void | Promise<void>;
  onClear?: () => void;
};

const GLASS = "border border-white/10 bg-black/70 backdrop-blur-xl";

export function EditToolbar({
  mapId,
  isEditMode,
  onAddClaim,
  onAutoFormat,
  onClear,
}: Props) {
  const mode = useUIStore((s) => s.mode);
  const tool = useUIStore((s) => s.tool);
  const color = useUIStore((s) => s.color);
  const fontSize = useUIStore((s) => s.fontSize);
  const setMode = useUIStore((s) => s.setMode);
  const setTool = useUIStore((s) => s.setTool);
  const setColor = useUIStore((s) => s.setColor);
  const setFontSize = useUIStore((s) => s.setFontSize);
  const undo = useUIStore((s) => s.undo);
  const redo = useUIStore((s) => s.redo);
  const addOptimistic = useUIStore((s) => s.addOptimistic);
  const removeOptimistic = useUIStore((s) => s.removeOptimistic);
  // "draw" = drawing sub-toolbar open, "text" = text sub-toolbar open, null = closed
  const [activeSub, setActiveSub] = useState<"draw" | "text" | null>(null);
  const isEditingTextbox = useUIStore((s) => s.isEditingTextbox);

  // Close the text sub-toolbar when the user finishes editing a textbox
  // (isEditingTextbox true→false). This keeps the toolbar open while typing
  // so color/size controls remain accessible.
  const prevEditingRef = useRef(false);
  useEffect(() => {
    const wasEditing = prevEditingRef.current;
    prevEditingRef.current = isEditingTextbox;
    if (wasEditing && !isEditingTextbox) {
      setActiveSub((prev) => (prev === "text" ? null : prev));
    }
  }, [isEditingTextbox]);

  const onUndo = useCallback(async () => {
    const action = undo();
    if (!action) return;
    try {
      if (action.type === "create") {
        removeOptimistic(action.annotation.id);
        await deleteAnnotation(mapId, action.annotation.id);
      } else if (action.type === "delete") {
        addOptimistic(action.annotation);
        await createAnnotation(mapId, action.annotation);
      } else {
        // undo clear — restore all deleted annotations
        for (const ann of action.annotations) addOptimistic(ann);
        await Promise.all(action.annotations.map((ann) => createAnnotation(mapId, ann)));
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
      } else if (action.type === "delete") {
        removeOptimistic(action.annotation.id);
        await deleteAnnotation(mapId, action.annotation.id);
      } else {
        // redo clear — delete all annotations again
        for (const ann of action.annotations) removeOptimistic(ann.id);
        await Promise.all(action.annotations.map((ann) => deleteAnnotation(mapId, ann.id)));
      }
    } catch (err) {
      console.error("[toolbar] redo failed", err);
    }
  }, [redo, mapId, addOptimistic, removeOptimistic]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
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

  const drawIcon =
    mode === "erase" ? <Eraser size={18} /> :
    tool === "pen" ? <Pen size={18} /> :
    tool === "highlighter" ? <Highlighter size={18} /> :
    <PencilSimple size={18} />;

  const subOpen = activeSub !== null;
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="pointer-events-none absolute bottom-7 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2 select-none">
      {/* Sub-toolbar — floats above the main pill when Draw or Text is active.
          Drawing tool variants only appear when the draw sub is open. */}
      <div
        className={clsx(
          "flex h-12 items-center gap-0.5 rounded-full pl-2 pr-2.5 transition-all duration-200 ease-out",
          GLASS,
          subOpen
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-1 scale-95 opacity-0",
        )}
        style={{ cursor: CURSORS.pointer }}
        aria-hidden={!subOpen}
      >
        {/* Drawing tool variants — only shown in draw sub-toolbar */}
        {activeSub === "draw" && (
          <>
            <ToolButton tool="pencil" active={mode === "draw" && tool === "pencil"} onClick={() => setTool("pencil")} aria-label="Pencil">
              <PencilSimple size={18} />
            </ToolButton>
            <ToolButton tool="pen" active={mode === "draw" && tool === "pen"} onClick={() => setTool("pen")} aria-label="Marker">
              <Pen size={18} />
            </ToolButton>
            <ToolButton tool="highlighter" active={mode === "draw" && tool === "highlighter"} onClick={() => setTool("highlighter")} aria-label="Highlighter">
              <Highlighter size={18} />
            </ToolButton>
            <Divider />
          </>
        )}

        {/* Font size S/M/L — only shown in text sub-toolbar */}
        {activeSub === "text" && (
          <>
            {TEXT_FONT_SIZES.map((sz, i) => (
              <FontSizeButton
                key={sz}
                size={sz}
                label={["S", "M", "L"][i]!}
                active={fontSize === sz}
                onClick={() => setFontSize(sz as TextFontSize)}
              />
            ))}
            <Divider />
          </>
        )}

        {/* Color swatches — shared between draw and text sub-toolbars */}
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`Color ${swatch}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setColor(swatch)}
            className={clsx(
              "flex size-7 items-center justify-center rounded-full transition-colors hover:bg-white/10",
              color === swatch && "ring-1 ring-white/40",
            )}
          >
            <span className="block size-3.5 rounded-full border border-white/20" style={{ background: swatch }} />
          </button>
        ))}

        <Divider />

        <Btn active={mode === "erase"} onClick={() => setMode("erase")} aria-label="Eraser">
          <Eraser size={18} />
        </Btn>

        {onClear && (
          <>
            <Divider />
            <Btn onClick={onClear} aria-label="Clear all drawings">
              <Broom size={18} />
            </Btn>
          </>
        )}
      </div>

      {/* Main pill — always visible */}
      <div
        className={clsx("pointer-events-auto flex h-12 items-center gap-1 rounded-full px-2", GLASS)}
        style={{ cursor: CURSORS.pointer }}
      >
        {/* Drag / pan mode */}
        <button
          type="button"
          onPointerDown={() => { setIsDragging(true); setMode("drag"); setActiveSub(null); }}
          onPointerUp={() => setIsDragging(false)}
          onPointerLeave={() => setIsDragging(false)}
          onClick={() => { setMode("drag"); setActiveSub(null); }}
          aria-label="Drag to pan"
          aria-pressed={mode === "drag"}
          className={clsx(
            "flex size-9 items-center justify-center transition-colors",
            mode === "drag"
              ? "rounded-full bg-white/15 text-white"
              : "rounded-full text-white/60 hover:bg-white/10 hover:text-white",
          )}
        >
          {mode === "drag" && isDragging ? <HandGrabbing size={18} /> : <Hand size={18} />}
        </button>

        {/* Cursor / select mode */}
        <button
          type="button"
          onClick={() => { setMode("select"); setActiveSub(null); }}
          aria-label="Select / pan mode"
          aria-pressed={mode === "select"}
          className={clsx(
            "flex size-9 items-center justify-center transition-colors",
            mode === "select"
              ? "rounded-full bg-white/15 text-white"
              : "rounded-full text-white/60 hover:bg-white/10 hover:text-white",
          )}
        >
          <Cursor size={18} />
        </button>

        {/* Draw — icon reflects current drawing tool */}
        <button
          type="button"
          onClick={() => {
            if (activeSub === "draw") {
              setActiveSub(null);
            } else {
              setActiveSub("draw");
              if (tool === "textbox") setTool("pencil");
              else if (mode !== "draw" && mode !== "erase") setMode("draw");
            }
          }}
          aria-label="Drawing tools"
          aria-pressed={activeSub === "draw"}
          className={clsx(
            "flex size-9 items-center justify-center transition-colors",
            activeSub === "draw"
              ? "rounded-full bg-white/15 text-white"
              : "rounded-full text-white/60 hover:bg-white/10 hover:text-white",
          )}
        >
          {drawIcon}
        </button>

        {/* Text box tool */}
        <button
          type="button"
          onClick={() => {
            if (activeSub === "text") {
              setActiveSub(null);
            } else {
              setActiveSub("text");
              setTool("textbox");
            }
          }}
          aria-label="Text box"
          aria-pressed={activeSub === "text"}
          className={clsx(
            "flex size-9 items-center justify-center transition-colors",
            activeSub === "text"
              ? "rounded-full bg-white/15 text-white"
              : "rounded-full text-white/60 hover:bg-white/10 hover:text-white",
          )}
        >
          <TextT size={18} />
        </button>

        {onAutoFormat && (
          <>
            <Divider />
            <AutoFormatButton onFormat={onAutoFormat} />
          </>
        )}
      </div>
    </div>
  );
}

function AutoFormatButton({ onFormat }: { onFormat: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const handleClick = useCallback(async () => {
    setBusy(true);
    try { await onFormat(); } finally { setBusy(false); }
  }, [onFormat]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label="Auto-format layout"
      className="flex items-center rounded-full border border-white/20 px-4 py-2 text-[14px] text-white transition-all duration-150 hover:border-white/40 disabled:opacity-40"
      style={{ fontFamily: "var(--font-dm-sans), sans-serif" }}
    >
      {busy ? "Formatting…" : "Format"}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px bg-white/15" aria-hidden />;
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
        "flex size-7 items-center justify-center transition-colors",
        active
          ? "rounded-full bg-white/15 text-white"
          : "rounded-full text-white/60 hover:bg-white/10 hover:text-white",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function Btn({
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
        "flex size-7 items-center justify-center transition-colors",
        active
          ? "rounded-full bg-white/15 text-white"
          : "rounded-full text-white/60 hover:bg-white/10 hover:text-white",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function FontSizeButton({
  size,
  label,
  active,
  onClick,
}: {
  size: TextFontSize;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  // Visual size of the "A" scales with the font size option so the user can
  // see the difference at a glance. Mapped to 11/14/18px for the pill context.
  const displaySize = size === 16 ? 11 : size === 24 ? 14 : 18;
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={`Font size ${label}`}
      aria-pressed={active}
      className={clsx(
        "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
        active
          ? "bg-white/15 text-white"
          : "text-white/60 hover:bg-white/10 hover:text-white",
      )}
      style={{ fontFamily: "var(--font-caveat), Caveat, cursive", fontSize: displaySize, lineHeight: 1 }}
    >
      A
    </button>
  );
}

export type { CanvasMode, DrawingTool };
