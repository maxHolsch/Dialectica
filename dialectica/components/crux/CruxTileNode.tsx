"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

/** A sub-crux tile in the crux view. Figma node 2:9 / 4:11 / 4:12 / 4:13. */
export const CruxTileNode = memo(function CruxTileNode({
  data,
  width,
  height,
}: NodeProps) {
  const text = (data?.text as string) ?? "";
  const w = width ?? 336;
  const h = height ?? 265;
  return (
    <div
      className="group relative flex cursor-pointer items-center justify-center rounded-[4px] border-2 border-dashed border-dia-pink bg-dia-bg px-4 transition-colors hover:border-dia-mint"
      style={{ width: w, height: h }}
    >
      <p className="text-center font-mono text-[14px] leading-[1.55] text-dia-fg">
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
