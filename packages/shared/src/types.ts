export const NODE_KINDS = ["start", "action", "decision", "end"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const DEFAULT_NODE_COLOR = "#94a3b8"; // slate-400

/**
 * A node as it appears in a serialized snapshot. `content` is flattened to a
 * plain string here; in the live Y.Doc it is a nested Y.Text (see doc.ts).
 */
export interface SnapshotNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  color: string;
  content: string;
}

export interface SnapshotEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

/** Read-only JSON projection of a board. Never the source of truth. */
export interface CanvasSnapshot {
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
}

export const EMPTY_SNAPSHOT: CanvasSnapshot = { nodes: [], edges: [] };
