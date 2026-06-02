"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeHandles } from "@/components/canvas/NodeHandles";

/** Top-level question tile in the crux view. Figma node 2:9 / 4:14. */
export const TopQuestionNode = memo(function TopQuestionNode({
  data,
  width,
  height,
}: NodeProps) {
  const text = (data?.text as string) ?? "";
  const w = width ?? 290;
  const h = height ?? 265;
  return (
    <div
      className="group relative flex cursor-pointer items-center justify-center rounded-[4px] border-2 border-dashed border-dia-mint bg-dia-bg px-4 transition-colors hover:border-dia-fg"
      style={{ width: w, height: h }}
    >
      <p className="text-center font-mono text-[14px] leading-[1.55] text-dia-fg">
        {text}
      </p>
      <NodeHandles />
    </div>
  );
});
