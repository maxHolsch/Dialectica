"use client";

import { memo, useState } from "react";
import type { NodeProps } from "@xyflow/react";

/** A crux question tile in the crux view — rectangular with Q-index label. */
export const CruxTileNode = memo(function CruxTileNode({
  data,
  width,
  height,
}: NodeProps) {
  const text = (data?.text as string) ?? "";
  const index = (data?.index as number) ?? 1;
  const bgColor = (data?.bgColor as string) ?? "#ffffff";
  const textColor = (data?.textColor as string) ?? "#000000";
  const w = width ?? 200;
  const h = height ?? 200;
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative transition-[filter] duration-150"
      style={{
        width: w,
        height: h,
        backgroundColor: bgColor,
        filter: hovered ? "brightness(0.93)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        className="absolute left-3 top-3 text-[10px]"
        style={{
          fontFamily: "var(--font-dm-sans), sans-serif",
          color: textColor,
          opacity: 0.5,
        }}
      >
        Q{index}
      </span>
      <div className="flex h-full items-center justify-center px-5">
        <p
          className="text-center font-serif text-[16px] leading-[1.45]"
          style={{ color: textColor }}
        >
          {text}
        </p>
      </div>
    </div>
  );
});
