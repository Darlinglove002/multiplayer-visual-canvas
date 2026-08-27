"use client";

import type * as Y from "yjs";
import { nanoid } from "nanoid";
import {
  LOCAL_ORIGIN,
  type NodeKind,
  createEdge,
  createNode,
  updateEdgeLabel,
  updateNodeField,
} from "@canvas/shared";

const DEFAULT_LABEL: Record<NodeKind, string> = {
  start: "Start",
  action: "Step",
  decision: "Decision?",
  end: "End",
};

export function addNode(
  doc: Y.Doc,
  params: { kind: NodeKind; x: number; y: number; content?: string },
): string {
  const id = `n_${nanoid(10)}`;
  createNode(
    doc,
    id,
    { kind: params.kind, x: params.x, y: params.y, content: params.content ?? DEFAULT_LABEL[params.kind] },
    LOCAL_ORIGIN,
  );
  return id;
}

export function setNodeColor(doc: Y.Doc, id: string, color: string): void {
  updateNodeField(doc, id, "color", color, LOCAL_ORIGIN);
}

export function setNodeKind(doc: Y.Doc, id: string, kind: NodeKind): void {
  updateNodeField(doc, id, "kind", kind, LOCAL_ORIGIN);
}

export function connectNodes(doc: Y.Doc, source: string, target: string): void {
  createEdge(doc, `e_${nanoid(10)}`, { source, target }, LOCAL_ORIGIN);
}

export function setEdgeLabel(doc: Y.Doc, id: string, label: string): void {
  updateEdgeLabel(doc, id, label, LOCAL_ORIGIN);
}
