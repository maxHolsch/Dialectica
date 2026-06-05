"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";

/** A sub-crux question bubble in the crux view — circular. */
export const CruxTileNode = memo(function CruxTileNode({
  data,
  width,
}: NodeProps) {
  const text = (data?.text as string) ?? "";
  const size = width ?? 220;
  return (
    <div
      className="group relative flex cursor-pointer items-center justify-center rounded-full border border-black/10 bg-white px-5 transition-all duration-200 ease-out hover:border-black/20 hover:bg-[#FAFAFA] hover:scale-[1.06]"
      style={{ width: size, height: size }}
    >
      <p className="text-center font-serif text-[15px] leading-[1.45] text-dia-fg">
        {text}
      </p>
    </div>
  );
});
