"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { nanoid } from "nanoid";
import {
  LOCAL_ORIGIN,
  createEdge,
  deleteEdge,
  deleteNode,
  edgesForFlow,
  getEdgesMap,
  getNodesMap,
  nodesForFlow,
  updateNodePosition,
} from "@canvas/shared";
import { useYDoc } from "./ydoc";
import type { LabeledEdge, LogicNode } from "./types";

/**
 * The Y.Doc <-> React Flow binding.
 *
 * - Y.Doc is the source of truth for durable state (node existence, position,
 *   kind, color; edge existence, label).
 * - React state holds ephemeral UI only (selection, measured dimensions,
 *   in-flight drag position).
 * - Every durable mutation goes through `doc.transact(fn, LOCAL_ORIGIN)` so the
 *   per-client UndoManager tracks exactly this user's changes.
 */
export function useYjsFlow() {
  const { doc, undoManager } = useYDoc();
  const [nodes, setNodes] = useState<LogicNode[]>([]);
  const [edges, setEdges] = useState<LabeledEdge[]>([]);
  // Nodes mid-drag: keep the local position, ignore the Y.Doc echo until drop.
  const draggingIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const nodesMap = getNodesMap(doc);
    const edgesMap = getEdgesMap(doc);

    const syncNodes = (events?: Y.YEvent<Y.AbstractType<unknown>>[]) => {
      // Pure content typing (Y.Text edits) doesn't change anything React Flow
      // renders — skip the array rebuild.
      if (events && events.length > 0 && events.every((e) => e.target instanceof Y.Text)) {
        return;
      }
      const views = nodesForFlow(doc);
      setNodes((prev) => {
        const prevById = new Map(prev.map((n) => [n.id, n]));
        return views.map((v): LogicNode => {
          const p = prevById.get(v.id);
          const position =
            p && draggingIds.current.has(v.id) ? p.position : { x: v.x, y: v.y };
          // Preserve React Flow's own bookkeeping (measured size, selection,
          // drag state) — only position and data are ours to own.
          if (p) return { ...p, position, data: { kind: v.kind, color: v.color } };
          // Initial size hint so a node (and its edges) render on first paint,
          // before React Flow's ResizeObserver measures the real size.
          return {
            id: v.id,
            type: "logic",
            position,
            data: { kind: v.kind, color: v.color },
            width: 184,
            height: 48,
          };
        });
      });
    };

    const syncEdges = () => {
      const views = edgesForFlow(doc);
      setEdges((prev) => {
        const prevById = new Map(prev.map((e) => [e.id, e]));
        return views.map((v): LabeledEdge => {
          const p = prevById.get(v.id);
          const data = { label: v.label ?? "" };
          if (p) return { ...p, source: v.source, target: v.target, data };
          return { id: v.id, type: "labeled", source: v.source, target: v.target, data };
        });
      });
    };

    syncNodes();
    syncEdges();
    nodesMap.observeDeep(syncNodes);
    edgesMap.observeDeep(syncEdges);
    return () => {
      nodesMap.unobserveDeep(syncNodes);
      edgesMap.unobserveDeep(syncEdges);
    };
  }, [doc]);

  const onNodesChange = useCallback(
    (changes: NodeChange<LogicNode>[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      // A drop (`dragging === false`) or a delete should be its own undo step,
      // not merged with the previous action by captureTimeout. Mid-drag changes
      // (`dragging === true`) and programmatic echoes (`dragging === undefined`)
      // are not written to the doc.
      const durable = changes.some(
        (c) => c.type === "remove" || (c.type === "position" && c.dragging === false),
      );
      if (durable) undoManager.stopCapturing();
      doc.transact(() => {
        for (const c of changes) {
          if (c.type === "position") {
            if (c.dragging === true) {
              draggingIds.current.add(c.id);
            } else if (c.dragging === false) {
              draggingIds.current.delete(c.id);
              if (c.position) {
                updateNodePosition(doc, c.id, c.position.x, c.position.y, LOCAL_ORIGIN);
              }
            }
          } else if (c.type === "remove") {
            deleteNode(doc, c.id, LOCAL_ORIGIN);
          }
        }
      }, LOCAL_ORIGIN);
    },
    [doc, undoManager],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<LabeledEdge>[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
      if (changes.some((c) => c.type === "remove")) {
        undoManager.stopCapturing();
        doc.transact(() => {
          for (const c of changes) {
            if (c.type === "remove") deleteEdge(doc, c.id, LOCAL_ORIGIN);
          }
        }, LOCAL_ORIGIN);
      }
    },
    [doc, undoManager],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      undoManager.stopCapturing();
      createEdge(
        doc,
        `e_${nanoid(10)}`,
        { source: conn.source, target: conn.target },
        LOCAL_ORIGIN,
      );
    },
    [doc, undoManager],
  );

  return { nodes, edges, onNodesChange, onEdgesChange, onConnect };
}
