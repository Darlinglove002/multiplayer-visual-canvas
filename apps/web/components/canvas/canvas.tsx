"use client";

import { useCallback, useState } from "react";
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
import { usePresenceActions } from "@/lib/canvas/presence";
import { addNode } from "@/lib/canvas/actions";
import { LogicNode } from "./logic-node";
import { LabeledEdge } from "./labeled-edge";
import { Toolbar } from "./toolbar";
import { PresenceCursors } from "./presence-cursors";
import { ConnectionStatus } from "./connection-status";
import { ShareButton } from "./share-button";
import { NodeMenu } from "./node-menu";
import { AiPrompt } from "./ai-prompt";

const nodeTypes: NodeTypes = { logic: LogicNode };
const edgeTypes: EdgeTypes = { labeled: LabeledEdge };

export function Canvas() {
  const { doc, undoManager, synced } = useYDoc();
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useYjsFlow();
  const { setCursor } = usePresenceActions();
  const { screenToFlowPosition } = useReactFlow();
  const [menu, setMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);

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

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      setCursor(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [setCursor, screenToFlowPosition],
  );
  const onPointerLeave = useCallback(() => setCursor(null), [setCursor]);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: { id: string }) => {
    e.preventDefault();
    setMenu({ nodeId: node.id, x: e.clientX, y: e.clientY });
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);

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
      className="relative h-dvh w-screen bg-[var(--canvas-bg)] outline-none"
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={closeMenu}
        onMoveStart={closeMenu}
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
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--canvas-dots)" />
        <Controls showInteractive={false} className="!shadow-sm" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => (n.data as { color?: string }).color ?? "#94a3b8"}
          maskColor="transparent"
          className="!rounded-lg !border !border-slate-200 !bg-white/70 !shadow-sm dark:!border-slate-800 dark:!bg-slate-900/70"
        />
        <PresenceCursors />
        <Panel position="top-left">
          <Toolbar />
        </Panel>
        <Panel position="top-right" className="flex items-center gap-1.5">
          <ShareButton />
          <ConnectionStatus />
        </Panel>
        <Panel position="bottom-center">
          <AiPrompt />
        </Panel>
        {!synced && (
          <Panel position="top-center">
            <span className="rounded-md border border-slate-200 bg-white/90 px-2.5 py-1 text-xs text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
              Loading board…
            </span>
          </Panel>
        )}
      </ReactFlow>

      {synced && nodes.length === 0 && (
        <p className="pointer-events-none absolute left-1/2 top-[42%] w-64 -translate-x-1/2 text-center text-sm leading-relaxed text-slate-400">
          Double-click anywhere to add a block, drag from a handle to connect two, or ask the
          AI below to sketch a whole flow.
        </p>
      )}

      {menu && (
        <NodeMenu nodeId={menu.nodeId} x={menu.x} y={menu.y} onClose={closeMenu} />
      )}
    </div>
  );
}
