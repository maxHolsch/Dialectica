import Link from "next/link";
import { cn } from "@/lib/utils";
import type { MapCard as MapCardData } from "@/lib/data/maps";
import { MapPreview } from "./MapPreview";

export function MapCard({ card }: { card: MapCardData }) {
  return (
    <Link
      href={`/m/${card.id}/crux`}
      className={cn(
        "group relative flex h-[320px] flex-col overflow-hidden rounded-lg border border-dia-border bg-dia-surface",
        "transition-colors hover:border-dia-border-strong",
      )}
    >
      <MapPreview kind={card.previewKind} />
      <VisibilityPill visibility={card.visibility} />

      <div className="border-t border-dia-border-subtle" />

      <div className="relative flex-1 px-4 pt-5">
        <h3 className="font-mono text-[18px] leading-[1.3] tracking-[-0.18px] text-dia-fg">
          {card.title}
        </h3>
        <div className="absolute inset-x-4 bottom-3 flex items-center justify-between">
          <span className="font-mono text-[11px] text-dia-fg-dim">
            {card.editedLabel}
          </span>
          <CollaboratorStack collaborators={card.collaborators} />
        </div>
      </div>
    </Link>
  );
}

function VisibilityPill({
  visibility,
}: {
  visibility: MapCardData["visibility"];
}) {
  const label = visibility === "public" ? "Public" : "Private";
  return (
    <span className="absolute left-[9px] top-[9px] flex h-5 items-center rounded-[3px] border border-dia-border bg-dia-bg px-2 font-mono text-[10px] tracking-[1.2px] text-dia-fg-dim">
      {label}
    </span>
  );
}

function CollaboratorStack({
  collaborators,
}: {
  collaborators: MapCardData["collaborators"];
}) {
  return (
    <div className="flex -space-x-[6px]">
      {collaborators.map((c, i) => (
        <span
          key={i}
          className="flex size-5 items-center justify-center rounded-full font-mono text-[9px] font-bold text-black/70 ring-2 ring-dia-surface"
          style={{ backgroundColor: c.color }}
        >
          {c.initials}
        </span>
      ))}
    </div>
  );
}
