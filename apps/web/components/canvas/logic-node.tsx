"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getNodeContent, type NodeKind } from "@canvas/shared";
import { useYDoc } from "@/lib/canvas/ydoc";
import { useNodeField, useNodeText } from "@/lib/canvas/use-node";
import { useEditors, usePresenceActions } from "@/lib/canvas/presence";
import { KIND_META, type LogicNode as LogicNodeType } from "@/lib/canvas/types";
import { NodeEditor } from "./node-editor";

function LogicNodeImpl({ id, data, selected }: NodeProps<LogicNodeType>) {
  const { doc, undoManager } = useYDoc();
  const editors = useEditors();
  const { setEditing: broadcastEditing } = usePresenceActions();
  const text = useNodeText(id);
  const color = useNodeField(id, "color") || data.color;
  const kind = ((useNodeField(id, "kind") as NodeKind) || data.kind) as NodeKind;
  const [editing, setEditing] = useState(false);

  const startEditing = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
  }, []);
  const stopEditing = useCallback(() => setEditing(false), []);

  // Tell everyone else which node this client has open.
  useEffect(() => {
    if (!editing) return;
    broadcastEditing(id);
    return () => broadcastEditing(null);
  }, [editing, id, broadcastEditing]);

  const remoteEditor = editors.get(id);
  const yText = editing ? getNodeContent(doc, id) : null;
  const handleClass =
    "!h-2 !w-2 !rounded-full !border-2 !border-white !bg-slate-400 dark:!border-slate-900";

  return (
    <div
      onDoubleClick={startEditing}
      className={[
        "group relative min-w-[168px] max-w-[300px] rounded-xl border bg-white px-3 py-2 text-sm shadow-sm transition",
        "dark:bg-slate-900",
        selected
          ? "border-slate-300 ring-2 ring-slate-300/70 dark:border-slate-600 dark:ring-slate-700"
          : "border-slate-200 dark:border-slate-700",
      ].join(" ")}
      style={{
        borderLeft: `3px solid ${color}`,
        ...(remoteEditor ? { boxShadow: `0 0 0 2px ${remoteEditor.color}` } : null),
      }}
    >
      {remoteEditor && (
        <span
          className="absolute -top-2 right-2 rounded px-1 py-0.5 text-[9px] font-medium text-white"
          style={{ background: remoteEditor.color }}
        >
          {remoteEditor.name}
        </span>
      )}

      <div className="mb-1 flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
          {KIND_META[kind]?.label ?? kind}
        </span>
      </div>

      {editing && yText ? (
        <NodeEditor text={yText} undoManager={undoManager} onDone={stopEditing} />
      ) : (
        <div className="whitespace-pre-wrap break-words leading-snug text-slate-800 dark:text-slate-100">
          {text || <span className="text-slate-400">Double-click to edit</span>}
        </div>
      )}

      <Handle type="target" position={Position.Top} className={handleClass} />
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </div>
  );
}

export const LogicNode = memo(LogicNodeImpl);
