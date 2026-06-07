
export function HomepageTabs() {
  return (
    <div className="relative flex items-end justify-between border-b border-dia-border-subtle pb-2 font-serif text-[13px]">
      <div className="flex items-center gap-9">
        <span className="relative pb-3 font-medium text-dia-fg">
          All maps
          <span className="absolute -bottom-px left-0 h-0.5 w-16 bg-dia-fg" />
        </span>
      </div>
      <span className="pb-3 font-mono text-[13px] text-dia-fg-dim">
        Sorted by · last edited
      </span>
    </div>
  );
}
