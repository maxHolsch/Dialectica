"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode, type MouseEvent } from "react";
import type { MapCard as MapCardData } from "@/lib/data/maps";
import type { Mode } from "@/lib/data/users";
import { renameMap, deleteMap } from "@/lib/data/mutations";

// Wraps the visual MapCard in a Link, plus an edit-mode-only right-click menu
// with rename and delete. Browser-default prompt/confirm keep Phase 2 light;
// a custom dropdown can land in Phase 3 once edit-mode polish ships.
export function MapCardWrapper({
  card,
  mode,
  children,
}: {
  card: MapCardData;
  mode: Mode;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [, startTransition] = useTransition();

  if (mode !== "edit") {
    return (
      <Link href={`/m/${card.id}/crux`} className="block">
        {children}
      </Link>
    );
  }

  function onContextMenu(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  function onRename() {
    setMenu(null);
    const next = window.prompt("Rename map", card.title);
    if (next == null || next.trim() === "" || next === card.title) return;
    startTransition(async () => {
      await renameMap(card.id, next.trim());
    });
  }

  function onDelete() {
    setMenu(null);
    if (!window.confirm(`Delete "${card.title}"? This cannot be undone.`))
      return;
    startTransition(async () => {
      await deleteMap(card.id);
    });
  }

  return (
    <>
      <Link
        href={`/m/${card.id}/crux`}
        onContextMenu={onContextMenu}
        className="block"
      >
        {children}
      </Link>
      {menu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            role="menu"
            className="fixed z-50 min-w-[160px] overflow-hidden rounded-md border border-dia-border-strong bg-dia-surface py-1 shadow-lg"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              type="button"
              onClick={onRename}
              className="block w-full px-3 py-2 text-left font-mono text-[12px] text-dia-fg hover:bg-dia-border"
            >
              Rename…
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="block w-full px-3 py-2 text-left font-mono text-[12px] text-dia-pink hover:bg-dia-border"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </>
  );
}
