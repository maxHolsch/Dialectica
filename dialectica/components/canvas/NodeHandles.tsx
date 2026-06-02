"use client";

import { Fragment } from "react";
import { Handle, Position } from "@xyflow/react";
import { useUIStore } from "@/lib/state/useUIStore";

// Each node renders SLOTS_PER_SIDE source-only + target-only handles per
// cardinal side (40 total per node). The auto-format pass writes a slot
// index into each edge's sourceHandle/targetHandle, e.g. "src-top-2", which
// xyflow then snaps the edge endpoint to. Handles are zero-sized + transparent
// so they're invisible — they only exist as attachment anchors.
//
// SLOTS_PER_SIDE here MUST match the constant in lib/layout/elkAdapter.ts.
const SLOT_PCTS = [10, 30, 50, 70, 90] as const;

const CLS = "!h-0 !w-0 !border-0 !bg-transparent";

/**
 * 8 handles per node × 5 slots = 40 invisible attachment points. Connectable
 * only in move mode so users can still drag-reconnect an edge endpoint onto
 * a different node; canvas-level `nodesConnectable={false}` blocks creating
 * brand-new edges.
 */
export function NodeHandles() {
  const moveMode = useUIStore((s) => s.mode === "move");
  return (
    <>
      {SLOT_PCTS.map((pct, i) => (
        <Fragment key={i}>
          <Handle
            id={`src-top-${i}`}
            type="source"
            position={Position.Top}
            style={{ left: `${pct}%` }}
            className={CLS}
            isConnectable={moveMode}
          />
          <Handle
            id={`tgt-top-${i}`}
            type="target"
            position={Position.Top}
            style={{ left: `${pct}%` }}
            className={CLS}
            isConnectable={moveMode}
          />
          <Handle
            id={`src-bottom-${i}`}
            type="source"
            position={Position.Bottom}
            style={{ left: `${pct}%` }}
            className={CLS}
            isConnectable={moveMode}
          />
          <Handle
            id={`tgt-bottom-${i}`}
            type="target"
            position={Position.Bottom}
            style={{ left: `${pct}%` }}
            className={CLS}
            isConnectable={moveMode}
          />
          <Handle
            id={`src-left-${i}`}
            type="source"
            position={Position.Left}
            style={{ top: `${pct}%` }}
            className={CLS}
            isConnectable={moveMode}
          />
          <Handle
            id={`tgt-left-${i}`}
            type="target"
            position={Position.Left}
            style={{ top: `${pct}%` }}
            className={CLS}
            isConnectable={moveMode}
          />
          <Handle
            id={`src-right-${i}`}
            type="source"
            position={Position.Right}
            style={{ top: `${pct}%` }}
            className={CLS}
            isConnectable={moveMode}
          />
          <Handle
            id={`tgt-right-${i}`}
            type="target"
            position={Position.Right}
            style={{ top: `${pct}%` }}
            className={CLS}
            isConnectable={moveMode}
          />
        </Fragment>
      ))}
    </>
  );
}
