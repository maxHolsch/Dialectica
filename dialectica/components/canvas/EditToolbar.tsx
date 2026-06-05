"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PencilSimple,
  Pen,
  Highlighter,
  TextT,
  Eraser,
  ArrowCounterClockwise,
  ArrowClockwise,
  Hand,
  Cursor,
  CaretLeft,
  CaretDown,
} from "@phosphor-icons/react";
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
  isEditMode: boolean;
  onAddClaim?: () => void;
  onAutoFormat?: (strategy: LayoutStrategyId) => void | Promise<void>;
};

const SHADOW = { boxShadow: "0 1px 6px rgba(0,0,0,0.07)" };

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
  const [expanded, setExpanded] = useState(false);

  const swatches = isEditMode ? SWATCHES : SWATCHES.slice(1);

  const onUndo = useCallback(async () => {
    const action = undo();
    if (!action) return;
    try {
      if (action.type === "create") {
        removeOptimistic(action.annotation.id);
        await deleteAnnotation(mapId, action.annotation.id);
      } else {
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

  return (
    <div className="pointer-events-none absolute bottom-7 left-1/2 z-20 h-12 -translate-x-1/2 select-none">
      {/* Collapsed: 48×48 circle, matches back-button style */}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Show annotation tools"
        aria-expanded={expanded}
        className={clsx(
          "absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#EEEEEE] bg-white text-black transition-all duration-300 ease-out",
          expanded
            ? "pointer-events-none scale-90 opacity-0"
            : "pointer-events-auto scale-100 opacity-100 hover:bg-black/5",
        )}
        style={SHADOW}
      >
        <PencilSimple size={18} />
      </button>

      {/* Expanded pill */}
      <div
        className={clsx(
          "absolute left-1/2 top-1/2 flex h-12 origin-center -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 rounded-full border border-[#EEEEEE] bg-white px-1.5 transition-all duration-300 ease-out",
          expanded
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-90 opacity-0",
        )}
        style={SHADOW}
        aria-hidden={!expanded}
      >
        {/* Collapse */}
        <Btn onClick={() => setExpanded(false)} aria-label="Hide annotation tools">
          <CaretLeft size={16} />
        </Btn>
        <Divider />

        {/* Drawing tools */}
        <ToolButton tool="pencil" active={mode === "draw" && tool === "pencil"} onClick={() => setTool("pencil")} aria-label="Pencil">
          <PencilSimple size={16} />
        </ToolButton>
        <ToolButton tool="pen" active={mode === "draw" && tool === "pen"} onClick={() => setTool("pen")} aria-label="Pen">
          <Pen size={16} />
        </ToolButton>
        <ToolButton tool="highlighter" active={mode === "draw" && tool === "highlighter"} onClick={() => setTool("highlighter")} aria-label="Highlighter">
          <Highlighter size={16} />
        </ToolButton>
        <ToolButton tool="textbox" active={mode === "draw" && tool === "textbox"} onClick={() => setTool("textbox")} aria-label="Text box">
          <TextT size={16} />
        </ToolButton>

        <Divider />

        {/* Mode buttons */}
        <Btn active={mode === "select"} onClick={() => setMode("select")} aria-label="Select / pan mode">
          <Hand size={16} />
        </Btn>
        <Btn active={mode === "draw"} onClick={() => setMode("draw")} aria-label="Drawing mode">
          <PencilSimple size={16} />
        </Btn>
        <span aria-label="Current color" className="flex size-7 items-center justify-center">
          <span className="block size-3.5 rounded-full border border-[#EEEEEE]" style={{ background: color }} />
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
              "flex size-7 items-center justify-center rounded-full transition-colors hover:bg-black/5",
              color === swatch && "ring-1 ring-black/25",
            )}
          >
            <span className="block size-3.5 rounded-full border border-[#EEEEEE]" style={{ background: swatch }} />
          </button>
        ))}

        <Divider />

        <Btn active={mode === "erase"} onClick={() => setMode("erase")} aria-label="Eraser">
          <Eraser size={16} />
        </Btn>

        {/* Edit-mode only: move cursor for dragging nodes/edges */}
        {isEditMode && (
          <button
            type="button"
            onClick={() => setMode(mode === "move" ? "select" : "move")}
            aria-label="Move nodes and edges"
            aria-pressed={mode === "move"}
            className={clsx(
              "flex size-7 items-center justify-center rounded-full transition-colors",
              mode === "move"
                ? "bg-[#ffc943]/20 text-[#ffc943] ring-1 ring-[#ffc943]"
                : "text-[#ffc943] hover:bg-[#ffc943]/15",
            )}
          >
            <Cursor size={16} />
          </button>
        )}

        <Btn onClick={onUndo} aria-label="Undo">
          <ArrowCounterClockwise size={16} />
        </Btn>
        <Btn onClick={onRedo} aria-label="Redo">
          <ArrowClockwise size={16} />
        </Btn>

        {isEditMode && (
          <>
            <Divider />
            <button
              type="button"
              onClick={onAddClaim}
              className="rounded-full border border-dashed border-black/25 px-3 py-1 font-mono text-[11px] font-medium tracking-wide text-black/50 transition-colors hover:border-black/40 hover:text-black"
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

function AutoFormatMenu({ onPick }: { onPick: (strategy: LayoutStrategyId) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastStrategy, setLastStrategy] = useState<LayoutStrategyId>(DEFAULT_STRATEGY);
  const wrapRef = useRef<HTMLDivElement | null>(null);

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
        className="flex items-center gap-1 rounded-full border border-dashed border-black/25 px-3 py-1 font-mono text-[11px] font-medium tracking-wide text-black/50 transition-colors hover:border-black/40 hover:text-black disabled:opacity-50"
      >
        {busy ? "FORMATTING…" : "AUTO-FORMAT"}
        <CaretDown size={12} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute bottom-full right-0 mb-2 min-w-[220px] rounded-lg border border-[#EEEEEE] bg-white p-1"
          style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
        >
          {Object.values(LAYOUT_STRATEGIES).map((s) => (
            <button
              key={s.id}
              role="menuitem"
              type="button"
              onClick={() => handlePick(s.id)}
              className={clsx(
                "block w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-black/5",
                s.id === lastStrategy ? "text-black" : "text-black/50",
              )}
            >
              <div className="font-mono text-[11px] tracking-wide">
                {s.label}
                {s.id === lastStrategy ? "  ·  last used" : ""}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-black/35">
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
  return <span className="mx-0.5 h-4 w-px bg-[#EEEEEE]" aria-hidden />;
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
        "flex size-7 items-center justify-center rounded-full transition-colors",
        active ? "bg-black/10 text-black" : "text-black/50 hover:bg-black/5 hover:text-black",
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
        "flex size-7 items-center justify-center rounded-full transition-colors",
        active ? "bg-black/10 text-black" : "text-black/50 hover:bg-black/5 hover:text-black",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export type { CanvasMode, DrawingTool };
