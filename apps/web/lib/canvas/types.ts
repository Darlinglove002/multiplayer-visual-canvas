import type { Edge, Node } from "@xyflow/react";
import type { NodeKind } from "@canvas/shared";

/**
 * Node `data` deliberately does NOT carry `content` — the block text is a live
 * Y.Text that CodeMirror binds to directly (via `useNodeText` for the static
 * render). Only cheap scalar fields live here.
 */
export type LogicNodeData = {
  kind: NodeKind;
  color: string;
};

export type LogicNode = Node<LogicNodeData, "logic">;

export type LabeledEdgeData = {
  label: string;
};

export type LabeledEdge = Edge<LabeledEdgeData, "labeled">;

export const KIND_META: Record<NodeKind, { label: string; hint: string }> = {
  start: { label: "Start", hint: "entry point" },
  action: { label: "Action", hint: "a step" },
  decision: { label: "Decision", hint: "a branch" },
  end: { label: "End", hint: "terminal" },
};
