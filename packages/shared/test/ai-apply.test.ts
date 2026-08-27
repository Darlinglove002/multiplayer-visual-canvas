import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  AI_MAX_NODES,
  LOCAL_ORIGIN,
  createEdge,
  createNode,
  getEdgesMap,
  getNodesMap,
  intraSubgraphEdges,
  nodesForFlow,
  resolveAiGraph,
  type AiGraph,
} from "../src/index";

// Deterministic id generator for assertions.
function seqIds() {
  let n = 0;
  return () => `id${++n}`;
}

const graph: AiGraph = {
  nodes: [
    { tempId: "a", kind: "start", content: "Receive request" },
    { tempId: "b", kind: "decision", content: "In window?" },
    { tempId: "c", kind: "end", content: "Refund" },
    { tempId: "d", kind: "end", content: "Decline" },
  ],
  edges: [
    { source: "a", target: "b", label: "" },
    { source: "b", target: "c", label: "yes" },
    { source: "b", target: "d", label: "no" },
  ],
};

describe("resolveAiGraph", () => {
  it("assigns fresh ids and never uses the model's tempIds as real ids", () => {
    const r = resolveAiGraph(graph, new Set(), seqIds());
    expect(r.nodes.map((n) => n.id)).toEqual(["id1", "id2", "id3", "id4"]);
    expect(r.nodes.map((n) => n.tempId)).toEqual(["a", "b", "c", "d"]);
    // edges point at the generated ids, not "a"/"b"/...
    expect(r.edges[0]).toMatchObject({ source: "id1", target: "id2" });
    expect(r.edges[1]).toMatchObject({ source: "id2", target: "id3", label: "yes" });
  });

  it("keeps an edge endpoint that is an existing live node id", () => {
    const g: AiGraph = {
      nodes: [{ tempId: "x", kind: "action", content: "Notify" }],
      edges: [{ source: "live-node-7", target: "x", label: "" }],
    };
    const r = resolveAiGraph(g, new Set(["live-node-7"]), seqIds());
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0]).toMatchObject({ source: "live-node-7", target: "id1" });
  });

  it("drops dangling, self-loop, and duplicate edges", () => {
    const g: AiGraph = {
      nodes: [
        { tempId: "a", kind: "start", content: "A" },
        { tempId: "b", kind: "end", content: "B" },
      ],
      edges: [
        { source: "a", target: "b", label: "" }, // ok
        { source: "a", target: "b", label: "dup" }, // duplicate pair -> dropped
        { source: "a", target: "a", label: "" }, // self loop -> dropped
        { source: "a", target: "ghost", label: "" }, // unknown endpoint -> dropped
        { source: "nope", target: "b", label: "" }, // unknown endpoint -> dropped
      ],
    };
    const r = resolveAiGraph(g, new Set(), seqIds());
    expect(r.edges).toHaveLength(1);
  });

  it("clamps to AI_MAX_NODES", () => {
    const big: AiGraph = {
      nodes: Array.from({ length: AI_MAX_NODES + 15 }, (_, i) => ({
        tempId: `n${i}`,
        kind: "action" as const,
        content: `step ${i}`,
      })),
      edges: [],
    };
    const r = resolveAiGraph(big, new Set(), seqIds());
    expect(r.nodes).toHaveLength(AI_MAX_NODES);
  });

  it("intraSubgraphEdges only returns edges fully inside the new subgraph", () => {
    const g: AiGraph = {
      nodes: [
        { tempId: "a", kind: "start", content: "A" },
        { tempId: "b", kind: "end", content: "B" },
      ],
      edges: [
        { source: "a", target: "b", label: "" },
        { source: "existing-1", target: "a", label: "" }, // into the subgraph — not intra
      ],
    };
    const r = resolveAiGraph(g, new Set(["existing-1"]), seqIds());
    const intra = intraSubgraphEdges(g, r);
    expect(intra).toHaveLength(1);
    expect(intra[0]!.source).toBe(r.nodes[0]!.id);
  });
});

describe("applying a resolved graph to a Y.Doc", () => {
  // Mirrors lib/canvas/apply-ai-graph.ts minus the elk layout: everything in
  // ONE transaction so a single Ctrl+Z reverts the whole generation.
  function apply(doc: Y.Doc, um: Y.UndoManager, g: AiGraph, live: Set<string>) {
    const r = resolveAiGraph(g, live, seqIds());
    um.stopCapturing();
    doc.transact(() => {
      for (const n of r.nodes) {
        createNode(doc, n.id, { kind: n.kind, content: n.content, x: 0, y: 0 }, LOCAL_ORIGIN);
      }
      for (const e of r.edges) {
        createEdge(doc, e.id, { source: e.source, target: e.target, label: e.label }, LOCAL_ORIGIN);
      }
    }, LOCAL_ORIGIN);
    return r;
  }

  it("inserts the whole subgraph as a single undo step", () => {
    const doc = new Y.Doc();
    const um = new Y.UndoManager([getNodesMap(doc), getEdgesMap(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });

    apply(doc, um, graph, new Set());
    expect(getNodesMap(doc).size).toBe(4);
    expect(getEdgesMap(doc).size).toBe(3);
    expect(um.undoStack).toHaveLength(1);

    um.undo();
    expect(getNodesMap(doc).size).toBe(0);
    expect(getEdgesMap(doc).size).toBe(0);

    um.redo();
    expect(getNodesMap(doc).size).toBe(4);
    expect(getEdgesMap(doc).size).toBe(3);
  });

  it("undoing an AI generation leaves a collaborator's concurrent node alone", () => {
    const doc = new Y.Doc();
    const um = new Y.UndoManager([getNodesMap(doc), getEdgesMap(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });

    apply(doc, um, graph, new Set());
    // a remote peer adds a node with a different origin
    createNode(doc, "remote-1", { kind: "action", x: 0, y: 0 }, "remote");

    um.undo();
    expect(getNodesMap(doc).has("remote-1")).toBe(true);
    expect(getNodesMap(doc).size).toBe(1);
  });

  it("connects a generated subgraph into an existing node", () => {
    const doc = new Y.Doc();
    const um = new Y.UndoManager([getNodesMap(doc), getEdgesMap(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });
    createNode(doc, "existing", { kind: "start", x: 0, y: 0 }, "remote");

    const g: AiGraph = {
      nodes: [{ tempId: "step", kind: "action", content: "Do the thing" }],
      edges: [{ source: "existing", target: "step", label: "" }],
    };
    apply(doc, um, g, new Set(nodesForFlow(doc).map((n) => n.id)));

    expect(getNodesMap(doc).size).toBe(2);
    expect(getEdgesMap(doc).size).toBe(1);
    const [edge] = [...getEdgesMap(doc).values()];
    expect(edge!.get("source")).toBe("existing");
  });
});
