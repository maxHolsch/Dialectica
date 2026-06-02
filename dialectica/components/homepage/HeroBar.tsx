import Link from "next/link";
import { createMap } from "@/lib/data/mutations";
import type { Mode } from "@/lib/data/users";

export function HeroBar({ mode }: { mode: Mode }) {
  return (
    <div className="flex items-start justify-between gap-12 pt-[55px]">
      <p className="max-w-[1199px] text-[44px] font-normal leading-tight tracking-[-0.88px] text-dia-fg">
        &ldquo;It is the mark of an educated mind to be able to entertain a
        thought without accepting it.&rdquo; &mdash;Aristotle
      </p>
      <div className="flex shrink-0 items-center gap-2 pt-1">
        <SearchPill />
        {mode === "edit" && <AdminLink />}
        {mode === "edit" && <NewMapButton />}
      </div>
    </div>
  );
}

function AdminLink() {
  return (
    <Link
      href="/admin"
      className="flex h-11 items-center justify-center rounded-full border border-dia-border-strong px-4 font-mono text-[13px] tracking-[0.52px] text-dia-fg-muted hover:text-dia-fg"
    >
      ADMIN
    </Link>
  );
}

function SearchPill() {
  return (
    <label className="flex h-11 w-[280px] items-center gap-2 rounded-full border border-dia-border-strong px-4 font-mono text-[13px] text-dia-fg-dim">
      <span aria-hidden className="text-[14px]">
        ⌕
      </span>
      <input
        type="text"
        placeholder="Search maps, claims, cruxes…"
        className="flex-1 bg-transparent outline-none placeholder:text-dia-fg-dim"
        aria-label="Search maps, claims, cruxes"
      />
    </label>
  );
}

function NewMapButton() {
  return (
    <form action={createMap}>
      <button
        type="submit"
        className="flex h-11 w-36 items-center justify-center rounded-full bg-dia-mint font-mono text-[13px] font-bold tracking-[0.52px] text-black"
      >
        + NEW MAP
      </button>
    </form>
  );
}
