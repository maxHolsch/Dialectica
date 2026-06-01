"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

// Figma 52:56 — dashed selection outline. CSS outline + outline-offset wraps
// the node from the outside without affecting its layout box, so it scales
// to any width/height the node is given.
const SELECTED_OUTLINE: React.CSSProperties = {
  outline: "2px dashed #a8c5e6",
  outlineOffset: 14,
  borderRadius: 4,
};

/** Solid mint claim tile in the frame view. Figma node 2:15. */
export const ClaimNode = memo(function ClaimNode({
  data,
  width,
  height,
}: NodeProps) {
  const text = (data?.text as string) ?? "";
  const selected = (data?.selected as boolean) ?? false;
  const w = width ?? 368;
  const h = height ?? 300;
  return (
    <div
      className="relative flex items-center rounded-[4px] bg-dia-mint px-8"
      style={{ width: w, height: h, ...(selected ? SELECTED_OUTLINE : null) }}
    >
      <p className="font-mono text-[16px] leading-[1.5] text-black">{text}</p>
      <SilentHandles />
    </div>
  );
});

/** Pink question tile — distinguishes questions from claims at a glance. */
export const QuestionNode = memo(function QuestionNode({
  data,
  width,
  height,
}: NodeProps) {
  const text = (data?.text as string) ?? "";
  const selected = (data?.selected as boolean) ?? false;
  const w = width ?? 368;
  const h = height ?? 300;
  return (
    <div
      className="relative flex items-center rounded-[4px] bg-dia-pink px-8"
      style={{ width: w, height: h, ...(selected ? SELECTED_OUTLINE : null) }}
    >
      <p className="font-mono text-[16px] italic leading-[1.5] text-black">
        {text}
      </p>
      <SilentHandles />
    </div>
  );
});

function SilentHandles() {
  return (
    <>
      <Handle type="target" position={Position.Top} className="!h-0 !w-0 !border-0 !bg-transparent" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} className="!h-0 !w-0 !border-0 !bg-transparent" isConnectable={false} />
      <Handle type="target" position={Position.Left} className="!h-0 !w-0 !border-0 !bg-transparent" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="!h-0 !w-0 !border-0 !bg-transparent" isConnectable={false} />
    </>
  );
}
