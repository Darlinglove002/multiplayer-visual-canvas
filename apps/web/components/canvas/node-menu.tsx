"use client";

import { useEffect, useRef } from "react";
import { NODE_KINDS, kindColor, type NodeKind } from "@canvas/shared";
import { useYDoc } from "@/lib/canvas/ydoc";
import { removeNode, setNodeColor, setNodeKind } from "@/lib/canvas/actions";
import { KIND_META } from "@/lib/canvas/types";

const SWATCHES = [
  "#10b981",
  "#6366f1",
  "#f59e0b",
  "#ef4444",
  "#0ea5e9",
  "#ec4899",
  "#84cc16",
  "#64748b",
];

export function NodeMenu({
  nodeId,
  x,
  y,
  onClose,
}: {
  nodeId: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { doc, undoManager } = useYDoc();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const act = (fn: () => void) => {
    undoManager.stopCapturing();
    fn();
    undoManager.stopCapturing();
    onClose();
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 w-44 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
      style={{ left: Math.min(x, window.innerWidth - 190), top: Math.min(y, window.innerHeight - 220) }}
    >
      <p className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        Type
      </p>
      {NODE_KINDS.map((k: NodeKind) => (
        <button
          key={k}
          type="button"
          onClick={() => act(() => setNodeKind(doc, nodeId, k))}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: kindColor(k) }} />
          {KIND_META[k].label}
        </button>
      ))}

      <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
      <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        Colour
      </p>
      <div className="flex flex-wrap gap-1 px-2 pb-1">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Set colour ${c}`}
            onClick={() => act(() => setNodeColor(doc, nodeId, c))}
            className="h-5 w-5 rounded-full ring-1 ring-inset ring-black/10 transition hover:scale-110"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
      <button
        type="button"
        onClick={() => act(() => removeNode(doc, nodeId))}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        Delete block
      </button>
    </div>
  );
}
