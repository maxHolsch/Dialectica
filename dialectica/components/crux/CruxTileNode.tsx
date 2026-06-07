"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";

/** A crux question tile in the crux view — rectangular with Q-index label. */
export const CruxTileNode = memo(function CruxTileNode({
  data,
  width,
  height,
}: NodeProps) {
  const text = (data?.text as string) ?? "";
  const index = (data?.index as number) ?? 1;
  const w = width ?? 200;
  const h = height ?? 200;
  return (
    <div
      className="relative cursor-pointer border border-black bg-white hover:bg-[#FAFAFA] transition-colors duration-150"
      style={{ width: w, height: h }}
    >
      <span
        className="absolute left-3 top-3 text-[10px] text-black/40"
        style={{ fontFamily: "var(--font-dm-sans), sans-serif" }}
      >
        Q{index}
      </span>
      <div className="flex h-full items-center justify-center px-5">
        <p className="text-center font-serif text-[16px] leading-[1.45] text-dia-fg">
          {text}
        </p>
      </div>
    </div>
  );
});
