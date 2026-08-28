"use client";

import { useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { useYDoc } from "@/lib/canvas/ydoc";
import { setEdgeLabel } from "@/lib/canvas/actions";
import type { LabeledEdge as LabeledEdgeType } from "@/lib/canvas/types";

export function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<LabeledEdgeType>) {
  const { doc } = useYDoc();
  const [editing, setEditing] = useState(false);
  const label = data?.label ?? "";

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          strokeWidth: selected ? 2 : 1.5,
          stroke: selected ? "var(--edge-active)" : "var(--edge)",
        }}
      />
      {(label || editing) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            {editing ? (
              <input
                autoFocus
                defaultValue={label}
                onBlur={(e) => {
                  setEdgeLabel(doc, id, e.currentTarget.value.trim());
                  setEditing(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="w-24 rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-slate-700 shadow-sm outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
            ) : (
              <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                {label}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
