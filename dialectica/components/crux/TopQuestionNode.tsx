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
    <div className="relative" style={{ width: w, height: h }}>
      <NodeHandles />
    </div>
  );
});
