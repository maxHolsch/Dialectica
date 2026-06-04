"use client";

import { useState, useRef, useEffect } from "react";
import type { Avatar } from "./Topbar";

export function AvatarMenu({ avatar }: { avatar: Avatar }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex size-7 items-center justify-center rounded-full font-mono text-[11px] font-bold text-black/85 ring-2 ring-dia-bg cursor-pointer"
        style={{ backgroundColor: avatar.color }}
        aria-label="Open profile menu"
        aria-expanded={open}
      >
        {avatar.initials}
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 min-w-[110px] rounded-md border border-dia-border-strong bg-dia-bg shadow-lg">
          <form action="/sign-out" method="post">
            <button
              type="submit"
              className="w-full px-3 py-2 text-left font-mono text-[12px] tracking-[0.4px] text-dia-fg-muted transition-colors hover:bg-white/5 hover:text-dia-fg"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
