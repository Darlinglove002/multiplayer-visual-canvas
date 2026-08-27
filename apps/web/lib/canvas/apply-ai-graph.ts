"use client";

import type * as Y from "yjs";
import { nanoid } from "nanoid";
import {
  LOCAL_ORIGIN,
  createEdge,
  createNode,
  intraSubgraphEdges,
  nodesForFlow,
  resolveAiGraph,
  type AiGraph,
} from "@canvas/shared";
import { layoutSubgraph } from "./layout";

const NODE_W = 184;
const GAP = 140;

/**
 * Applies an AI-proposed graph to the board:
 *
 *  1. `resolveAiGraph` — clamp, regenerate ids, resolve/prune edges against the
 *     LIVE doc (not the snapshot Claude saw).
 *  2. elk lays out the new subgraph; the result is offset into free space to
 *     the right of everything that already exists.
 *  3. every node and edge is written in ONE `doc.transact(…, LOCAL_ORIGIN)` —
 *     so a single Ctrl+Z removes the whole generation.
 */
export async function applyAiGraph(
  doc: Y.Doc,
  undoManager: Y.UndoManager,
  graph: AiGraph,
  viewportCenter: { x: number; y: number },
): Promise<{ nodes: number; edges: number }> {
  const existing = nodesForFlow(doc);
  const liveIds = new Set(existing.map((n) => n.id));

  const resolved = resolveAiGraph(graph, liveIds, () => `ai_${nanoid(10)}`);
  if (resolved.nodes.length === 0) return { nodes: 0, edges: 0 };

  const positions = await layoutSubgraph(
    resolved.nodes.map((n) => n.id),
    intraSubgraphEdges(graph, resolved),
  );

  const offsetX = existing.length
    ? Math.max(...existing.map((n) => n.x)) + NODE_W + GAP
    : viewportCenter.x - NODE_W / 2;
  const offsetY = viewportCenter.y - 40;

  undoManager.stopCapturing();
  doc.transact(() => {
    for (const n of resolved.nodes) {
      const p = positions.get(n.id) ?? { x: 0, y: 0 };
      createNode(
        doc,
        n.id,
        { kind: n.kind, content: n.content, x: offsetX + p.x, y: offsetY + p.y },
        LOCAL_ORIGIN,
      );
    }
    for (const e of resolved.edges) {
      createEdge(
        doc,
        e.id,
        { source: e.source, target: e.target, label: e.label || undefined },
        LOCAL_ORIGIN,
      );
    }
  }, LOCAL_ORIGIN);

  return { nodes: resolved.nodes.length, edges: resolved.edges.length };
}
