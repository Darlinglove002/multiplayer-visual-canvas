import * as Y from "yjs";
import {
  DEFAULT_NODE_COLOR,
  type CanvasSnapshot,
  type NodeKind,
  type SnapshotEdge,
  type SnapshotNode,
} from "./types";

// Top-level shared types in the Y.Doc.
export const NODES_KEY = "nodes";
export const EDGES_KEY = "edges";
export const META_KEY = "meta";

// Per-node Y.Map keys. Everything is a plain value except `content`, which is a
// nested Y.Text so two people can edit one block's text without clobbering each
// other (LWW would drop keystrokes).
export const NODE_KEYS = {
  kind: "kind",
  x: "x",
  y: "y",
  color: "color",
  content: "content",
} as const;

export const EDGE_KEYS = {
  source: "source",
  target: "target",
  label: "label",
} as const;

export function getNodesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap(NODES_KEY);
}

export function getEdgesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap(EDGES_KEY);
}

export function getMetaMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(META_KEY);
}

function readContent(value: unknown): string {
  if (value instanceof Y.Text) return value.toString();
  if (typeof value === "string") return value;
  return "";
}

/**
 * Decode the live Y.Doc into a plain JSON snapshot. The sync server calls this
 * on every debounced store to keep `board_documents.snapshot` current; the AI
 * layer reads that snapshot as context.
 */
export function snapshotFromDoc(doc: Y.Doc): CanvasSnapshot {
  const nodes: SnapshotNode[] = [];
  for (const [id, node] of getNodesMap(doc)) {
    if (!(node instanceof Y.Map)) continue;
    nodes.push({
      id,
      kind: (node.get(NODE_KEYS.kind) as NodeKind) ?? "action",
      x: Number(node.get(NODE_KEYS.x) ?? 0),
      y: Number(node.get(NODE_KEYS.y) ?? 0),
      color: (node.get(NODE_KEYS.color) as string) ?? DEFAULT_NODE_COLOR,
      content: readContent(node.get(NODE_KEYS.content)),
    });
  }

  const edges: SnapshotEdge[] = [];
  for (const [id, edge] of getEdgesMap(doc)) {
    if (!(edge instanceof Y.Map)) continue;
    const source = edge.get(EDGE_KEYS.source);
    const target = edge.get(EDGE_KEYS.target);
    if (typeof source !== "string" || typeof target !== "string") continue;
    const label = edge.get(EDGE_KEYS.label);
    edges.push({
      id,
      source,
      target,
      ...(typeof label === "string" && label.length > 0 ? { label } : {}),
    });
  }

  return { nodes, edges };
}
