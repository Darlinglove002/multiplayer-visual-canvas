"use client";

import { useCallback } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useYDoc } from "@/lib/canvas/ydoc";
import { useYjsFlow } from "@/lib/canvas/use-yjs-flow";
import { addNode } from "@/lib/canvas/actions";
import { LogicNode } from "./logic-node";
import { LabeledEdge } from "./labeled-edge";
import { Toolbar } from "./toolbar";

const nodeTypes: NodeTypes = { logic: LogicNode };
const edgeTypes: EdgeTypes = { labeled: LabeledEdge };

export function Canvas() {
  const { doc, undoManager, synced } = useYDoc();
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useYjsFlow();
  const { screenToFlowPosition } = useReactFlow();

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      // Only a double-click on empty canvas adds a node; ignore clicks that
      // land on a node, edge, the toolbar, etc.
      if (!(e.target as HTMLElement).classList.contains("react-flow__pane")) return;
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(doc, { kind: "action", x: p.x - 84, y: p.y - 22 });
      undoManager.stopCapturing();
    },
    [doc, undoManager, screenToFlowPosition],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undoManager.undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        undoManager.redo();
      }
    },
    [undoManager],
  );

  return (
    <div
      className="relative h-dvh w-screen bg-[#fafafa] outline-none dark:bg-[#0a0a0a]"
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onDoubleClick={onDoubleClick}
        zoomOnDoubleClick={false}
        deleteKeyCode={["Delete", "Backspace"]}
        minZoom={0.2}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#d4d4d8" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => (n.data as { color?: string }).color ?? "#94a3b8"}
          className="!bg-white/80 dark:!bg-slate-900/80"
        />
        <Panel position="top-left">
          <Toolbar />
        </Panel>
        {!synced && (
          <Panel position="top-center">
            <span className="rounded-md bg-white/80 px-2 py-1 text-xs text-slate-500 shadow-sm dark:bg-slate-900/80">
              loading…
            </span>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
