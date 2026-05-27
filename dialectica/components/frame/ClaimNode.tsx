"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

/** Solid mint claim tile in the frame view. Figma node 2:15. */
export const ClaimNode = memo(function ClaimNode({
  data,
  width,
  height,
}: NodeProps) {
  const text = (data?.text as string) ?? "";
  const w = width ?? 368;
  const h = height ?? 300;
  return (
    <div
      className="relative flex items-center rounded-[4px] bg-dia-mint px-8"
      style={{ width: w, height: h }}
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
  const w = width ?? 368;
  const h = height ?? 300;
  return (
    <div
      className="relative flex items-center rounded-[4px] bg-dia-pink px-8"
      style={{ width: w, height: h }}
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
