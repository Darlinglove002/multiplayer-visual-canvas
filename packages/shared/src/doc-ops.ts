import * as Y from "yjs";
import { DEFAULT_NODE_COLOR, type NodeKind } from "./types";
import { EDGE_KEYS, NODE_KEYS, getEdgesMap, getNodesMap } from "./doc";

/**
 * Identity tag for transactions this client originated. Every local mutation
 * runs inside `doc.transact(fn, LOCAL_ORIGIN)`, and the per-client
 * `Y.UndoManager` is scoped with `trackedOrigins: new Set([LOCAL_ORIGIN])` —
 * so Ctrl+Z only ever reverts *this* user's changes, never a collaborator's.
 * `Symbol.for` keeps it stable even if this module is evaluated twice.
 */
export const LOCAL_ORIGIN: symbol = Symbol.for("canvas/local-origin");

export interface NewNode {
  kind: NodeKind;
  x: number;
  y: number;
  color?: string;
  content?: string;
}

/** Plain node view for React Flow — no `content` (that binds to the Y.Text directly). */
export interface FlowNodeView {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  color: string;
}

export interface FlowEdgeView {
  id: string;
  source: string;
  target: string;
  label?: string;
}

const KIND_COLORS: Record<NodeKind, string> = {
  start: "#10b981", // emerald
  action: "#6366f1", // indigo
  decision: "#f59e0b", // amber
  end: "#ef4444", // red
};

export function kindColor(kind: NodeKind): string {
  return KIND_COLORS[kind] ?? DEFAULT_NODE_COLOR;
}

// --- mutations (all take an `origin`; callers pass LOCAL_ORIGIN) ---

export function createNode(doc: Y.Doc, id: string, node: NewNode, origin: unknown): void {
  doc.transact(() => {
    const nodes = getNodesMap(doc);
    if (nodes.has(id)) return;
    const map = new Y.Map<unknown>();
    map.set(NODE_KEYS.kind, node.kind);
    map.set(NODE_KEYS.x, node.x);
    map.set(NODE_KEYS.y, node.y);
    map.set(NODE_KEYS.color, node.color ?? kindColor(node.kind));
    const text = new Y.Text();
    if (node.content) text.insert(0, node.content);
    map.set(NODE_KEYS.content, text);
    nodes.set(id, map);
  }, origin);
}

export function updateNodePosition(
  doc: Y.Doc,
  id: string,
  x: number,
  y: number,
  origin: unknown,
): void {
  doc.transact(() => {
    const node = getNodesMap(doc).get(id);
    if (!(node instanceof Y.Map)) return;
    node.set(NODE_KEYS.x, x);
    node.set(NODE_KEYS.y, y);
  }, origin);
}

export function updateNodeField(
  doc: Y.Doc,
  id: string,
  key: "color" | "kind",
  value: string,
  origin: unknown,
): void {
  doc.transact(() => {
    const node = getNodesMap(doc).get(id);
    if (!(node instanceof Y.Map)) return;
    node.set(NODE_KEYS[key], value);
  }, origin);
}

/** Deletes the node and any edge touching it, in one transaction (one undo step). */
export function deleteNode(doc: Y.Doc, id: string, origin: unknown): void {
  doc.transact(() => {
    const edges = getEdgesMap(doc);
    for (const [edgeId, edge] of edges) {
      if (!(edge instanceof Y.Map)) continue;
      if (edge.get(EDGE_KEYS.source) === id || edge.get(EDGE_KEYS.target) === id) {
        edges.delete(edgeId);
      }
    }
    getNodesMap(doc).delete(id);
  }, origin);
}

/** Returns the live Y.Text for a node's content, for binding CodeMirror. */
export function getNodeContent(doc: Y.Doc, id: string): Y.Text | null {
  const node = getNodesMap(doc).get(id);
  if (!(node instanceof Y.Map)) return null;
  const content = node.get(NODE_KEYS.content);
  return content instanceof Y.Text ? content : null;
}

/**
 * Creates an edge unless it would be a self-loop or duplicate a source→target
 * pair that already exists. Returns whether it was created.
 */
export function createEdge(
  doc: Y.Doc,
  id: string,
  edge: { source: string; target: string; label?: string },
  origin: unknown,
): boolean {
  if (edge.source === edge.target) return false;
  let created = false;
  doc.transact(() => {
    const edges = getEdgesMap(doc);
    if (edges.has(id)) return;
    for (const [, existing] of edges) {
      if (!(existing instanceof Y.Map)) continue;
      if (
        existing.get(EDGE_KEYS.source) === edge.source &&
        existing.get(EDGE_KEYS.target) === edge.target
      ) {
        return;
      }
    }
    const nodes = getNodesMap(doc);
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) return;
    const map = new Y.Map<unknown>();
    map.set(EDGE_KEYS.source, edge.source);
    map.set(EDGE_KEYS.target, edge.target);
    if (edge.label) map.set(EDGE_KEYS.label, edge.label);
    edges.set(id, map);
    created = true;
  }, origin);
  return created;
}

export function deleteEdge(doc: Y.Doc, id: string, origin: unknown): void {
  doc.transact(() => {
    getEdgesMap(doc).delete(id);
  }, origin);
}

export function updateEdgeLabel(doc: Y.Doc, id: string, label: string, origin: unknown): void {
  doc.transact(() => {
    const edge = getEdgesMap(doc).get(id);
    if (!(edge instanceof Y.Map)) return;
    if (label) edge.set(EDGE_KEYS.label, label);
    else edge.delete(EDGE_KEYS.label);
  }, origin);
}

// --- reads for the React Flow binding ---

export function nodesForFlow(doc: Y.Doc): FlowNodeView[] {
  const out: FlowNodeView[] = [];
  for (const [id, node] of getNodesMap(doc)) {
    if (!(node instanceof Y.Map)) continue;
    out.push({
      id,
      kind: (node.get(NODE_KEYS.kind) as NodeKind) ?? "action",
      x: Number(node.get(NODE_KEYS.x) ?? 0),
      y: Number(node.get(NODE_KEYS.y) ?? 0),
      color: (node.get(NODE_KEYS.color) as string) ?? DEFAULT_NODE_COLOR,
    });
  }
  return out;
}

export function edgesForFlow(doc: Y.Doc): FlowEdgeView[] {
  const out: FlowEdgeView[] = [];
  for (const [id, edge] of getEdgesMap(doc)) {
    if (!(edge instanceof Y.Map)) continue;
    const source = edge.get(EDGE_KEYS.source);
    const target = edge.get(EDGE_KEYS.target);
    if (typeof source !== "string" || typeof target !== "string") continue;
    const label = edge.get(EDGE_KEYS.label);
    out.push({
      id,
      source,
      target,
      ...(typeof label === "string" && label.length > 0 ? { label } : {}),
    });
  }
  return out;
}
