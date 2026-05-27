import { cn } from "@/lib/utils";

/**
 * Topbar — shared chrome across DIA-HOME-1, DIA-VIEW-1, DIA-VIEW-2.
 * Matches Figma file 8lnl3MImPRpi6QftZMEDsw nodes 2:5 / 2:9 / 2:15.
 */

export type Crumb =
  | { kind: "brand"; label: "DIALECTIA" }
  | { kind: "sep-slash" }
  | { kind: "sep-arrow" }
  | { kind: "medium"; label: string }
  | { kind: "dim"; label: string };

export type Avatar = { initials: string; color: string };
export type PresencePill =
  | { kind: "live"; count: number }
  | { kind: "settings" };

export function Topbar({
  crumbs,
  pill = { kind: "live", count: 2 },
  avatars = [],
}: {
  crumbs: Crumb[];
  pill?: PresencePill;
  avatars?: Avatar[];
}) {
  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-dia-border-strong bg-dia-bg px-6">
      <nav className="flex items-center font-mono text-[13px] leading-none">
        {crumbs.map((c, i) => (
          <Crumb key={i} crumb={c} />
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <ViewingPill />
        <PresencePillView pill={pill} />
        <div className="ml-1 flex items-center -space-x-1.5">
          {avatars.map((a, i) => (
            <AvatarChip key={i} avatar={a} />
          ))}
        </div>
      </div>
    </header>
  );
}

function Crumb({ crumb }: { crumb: Crumb }) {
  if (crumb.kind === "brand") {
    return (
      <span className="mr-[80px] font-bold tracking-[0.52px] text-dia-fg">
        {crumb.label}
      </span>
    );
  }
  if (crumb.kind === "sep-slash") {
    return <span className="mx-3 text-dia-border-strong">/</span>;
  }
  if (crumb.kind === "sep-arrow") {
    return <span className="mx-3 text-dia-border-strong">›</span>;
  }
  if (crumb.kind === "medium") {
    return (
      <span className="font-medium text-dia-fg-muted">{crumb.label}</span>
    );
  }
  return <span className="text-dia-fg-dim">{crumb.label}</span>;
}

function ViewingPill() {
  return (
    <span className="flex h-6 items-center rounded-full border border-dia-border-strong px-3 font-mono text-[12px] tracking-[0.48px] text-dia-fg-muted">
      VIEWING
    </span>
  );
}

function PresencePillView({ pill }: { pill: PresencePill }) {
  if (pill.kind === "settings") {
    return (
      <span className="flex h-6 items-center rounded-full border border-dia-border-strong px-3 font-mono text-[12px] tracking-[0.48px] text-dia-fg-muted">
        Settings
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex h-6 items-center gap-1.5 rounded-full px-3 font-mono text-[12px] tracking-[0.48px] text-dia-mint",
        "border border-[color:rgba(205,244,211,0.4)]",
      )}
    >
      <span
        aria-hidden
        className="inline-block size-1.5 rounded-full bg-dia-mint"
      />
      {pill.count} live
    </span>
  );
}

function AvatarChip({ avatar }: { avatar: Avatar }) {
  return (
    <span
      className="flex size-7 items-center justify-center rounded-full font-mono text-[11px] font-bold text-black/85 ring-2 ring-dia-bg"
      style={{ backgroundColor: avatar.color }}
    >
      {avatar.initials}
    </span>
  );
}
