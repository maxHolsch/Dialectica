import Link from "next/link";
import type { Mode } from "@/lib/data/users";

export function HeroBar({ mode }: { mode: Mode }) {
  return (
    <div className="flex items-start justify-between gap-12 pt-[55px]">
      <p className="max-w-[1199px] text-[44px] font-normal leading-tight tracking-[-0.88px] text-dia-fg">
        &ldquo;It is the mark of an educated mind to be able to entertain a
        thought without accepting it.&rdquo; &mdash;Aristotle
      </p>
      {mode === "edit" && (
        <div className="flex shrink-0 items-center gap-2 pt-1">
          <AdminLink />
        </div>
      )}
    </div>
  );
}

function AdminLink() {
  return (
    <Link
      href="/admin"
      className="flex h-11 w-36 items-center justify-center rounded-full bg-dia-mint font-mono text-[13px] font-bold tracking-[0.52px] text-black"
    >
      ADMIN
    </Link>
  );
}

