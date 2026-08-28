"use client";

import { useReactFlow } from "@xyflow/react";
import { kindColor, type NodeKind } from "@canvas/shared";
import { useYDoc } from "@/lib/canvas/ydoc";
import { addNode } from "@/lib/canvas/actions";
import { KIND_META } from "@/lib/canvas/types";

const KINDS: NodeKind[] = ["start", "action", "decision", "end"];

const btn =
  "rounded-lg px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus-visible:ring-slate-500";

// Deterministic fan-out so consecutively added blocks don't stack exactly.
let dropIndex = 0;
function dropOffset() {
  const i = dropIndex++ % 8;
  return { x: (i % 4) * 28 - 42, y: Math.floor(i / 4) * 64 - 32 };
}

export function Toolbar() {
  const { doc, undoManager } = useYDoc();
  const { screenToFlowPosition } = useReactFlow();

  const add = (kind: NodeKind) => {
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const off = dropOffset();
    addNode(doc, { kind, x: center.x - 92 + off.x, y: center.y - 24 + off.y });
    undoManager.stopCapturing();
  };

  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <span className="px-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        Add
      </span>
      {KINDS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => add(k)}
          title={KIND_META[k].hint}
          className={`flex items-center gap-1.5 ${btn}`}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: kindColor(k) }}
          />
          {KIND_META[k].label}
        </button>
      ))}
      <div className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />
      <button type="button" onClick={() => undoManager.undo()} title="Undo — Ctrl+Z" className={btn}>
        Undo
      </button>
      <button
        type="button"
        onClick={() => undoManager.redo()}
        title="Redo — Ctrl+Shift+Z"
        className={btn}
      >
        Redo
      </button>
    </div>
  );
}
