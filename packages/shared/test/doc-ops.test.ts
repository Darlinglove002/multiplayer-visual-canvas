import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  createEdge,
  createNode,
  deleteEdge,
  deleteNode,
  edgesForFlow,
  getEdgesMap,
  getNodeContent,
  getNodesMap,
  LOCAL_ORIGIN,
  nodesForFlow,
  snapshotFromDoc,
  updateEdgeLabel,
  updateNodeField,
  updateNodePosition,
} from "../src/index";
import type { FlowEdgeView, FlowNodeView } from "../src/index";

/** A non-local origin, standing in for a collaborator's mutation. */
const REMOTE = "remote";

function flowNode(doc: Y.Doc, id: string): FlowNodeView | undefined {
  return nodesForFlow(doc).find((n) => n.id === id);
}

function flowEdge(doc: Y.Doc, id: string): FlowEdgeView | undefined {
  return edgesForFlow(doc).find((e) => e.id === id);
}

describe("createNode / read round-trips", () => {
  it("round-trips kind/x/y/color through nodesForFlow and snapshotFromDoc", () => {
    const doc = new Y.Doc();
    createNode(
      doc,
      "n1",
      { kind: "start", x: 12, y: -34, color: "#123abc", content: "Получить заявку" },
      LOCAL_ORIGIN,
    );

    expect(nodesForFlow(doc)).toEqual([
      { id: "n1", kind: "start", x: 12, y: -34, color: "#123abc" },
    ]);

    const snap = snapshotFromDoc(doc);
    expect(snap.nodes).toEqual([
      { id: "n1", kind: "start", x: 12, y: -34, color: "#123abc", content: "Получить заявку" },
    ]);
    // content came back as a plain string, not a Y.Text.
    expect(typeof snap.nodes[0]?.content).toBe("string");
  });

  it("defaults color from kind and reads empty content as an empty string", () => {
    const doc = new Y.Doc();
    createNode(doc, "n1", { kind: "decision", x: 0, y: 0 }, LOCAL_ORIGIN);

    expect(flowNode(doc, "n1")?.color).toBe("#f59e0b"); // kindColor("decision")
    expect(snapshotFromDoc(doc).nodes[0]?.content).toBe("");
  });

  it("stores content as a live Y.Text reachable via getNodeContent", () => {
    const doc = new Y.Doc();
    createNode(doc, "n1", { kind: "action", x: 0, y: 0, content: "abc" }, LOCAL_ORIGIN);

    const text = getNodeContent(doc, "n1");
    expect(text).toBeInstanceOf(Y.Text);
    expect(text?.toString()).toBe("abc");

    doc.transact(() => text?.insert(3, "def"), LOCAL_ORIGIN);
    expect(snapshotFromDoc(doc).nodes[0]?.content).toBe("abcdef");
  });

  it("getNodeContent returns null for a missing node", () => {
    const doc = new Y.Doc();
    expect(getNodeContent(doc, "nope")).toBeNull();
  });

  it("is a no-op when the id already exists (does not overwrite)", () => {
    const doc = new Y.Doc();
    createNode(doc, "n1", { kind: "start", x: 1, y: 2, color: "#111111" }, LOCAL_ORIGIN);
    createNode(doc, "n1", { kind: "end", x: 99, y: 99, color: "#999999" }, LOCAL_ORIGIN);

    expect(flowNode(doc, "n1")).toEqual({ id: "n1", kind: "start", x: 1, y: 2, color: "#111111" });
  });
});

describe("updateNodePosition / updateNodeField", () => {
  it("updateNodePosition is reflected in the reads", () => {
    const doc = new Y.Doc();
    createNode(doc, "n1", { kind: "action", x: 0, y: 0 }, LOCAL_ORIGIN);
    updateNodePosition(doc, "n1", 40, 50, LOCAL_ORIGIN);

    expect(flowNode(doc, "n1")).toMatchObject({ x: 40, y: 50 });
  });

  it("updateNodeField updates color and kind", () => {
    const doc = new Y.Doc();
    createNode(doc, "n1", { kind: "action", x: 0, y: 0 }, LOCAL_ORIGIN);

    updateNodeField(doc, "n1", "color", "#abcdef", LOCAL_ORIGIN);
    updateNodeField(doc, "n1", "kind", "end", LOCAL_ORIGIN);

    expect(flowNode(doc, "n1")).toMatchObject({ kind: "end", color: "#abcdef" });
  });

  it("updateNodePosition / updateNodeField no-op on a missing node", () => {
    const doc = new Y.Doc();
    updateNodePosition(doc, "ghost", 1, 1, LOCAL_ORIGIN);
    updateNodeField(doc, "ghost", "color", "#000000", LOCAL_ORIGIN);
    expect(nodesForFlow(doc)).toEqual([]);
  });
});

describe("createEdge", () => {
  function docWithNodes(...ids: string[]): Y.Doc {
    const doc = new Y.Doc();
    ids.forEach((id, i) => {
      createNode(doc, id, { kind: "action", x: i * 10, y: 0 }, LOCAL_ORIGIN);
    });
    return doc;
  }

  it("returns true and shows up in edgesForFlow for a valid new edge", () => {
    const doc = docWithNodes("a", "b");
    expect(createEdge(doc, "e1", { source: "a", target: "b" }, LOCAL_ORIGIN)).toBe(true);
    expect(flowEdge(doc, "e1")).toEqual({ id: "e1", source: "a", target: "b" });
  });

  it("returns false for a self-loop", () => {
    const doc = docWithNodes("a");
    expect(createEdge(doc, "e1", { source: "a", target: "a" }, LOCAL_ORIGIN)).toBe(false);
    expect(edgesForFlow(doc)).toEqual([]);
  });

  it("returns false for a second edge with the same source -> target pair", () => {
    const doc = docWithNodes("a", "b");
    expect(createEdge(doc, "e1", { source: "a", target: "b" }, LOCAL_ORIGIN)).toBe(true);
    expect(createEdge(doc, "e2", { source: "a", target: "b" }, LOCAL_ORIGIN)).toBe(false);
    expect(edgesForFlow(doc).map((e) => e.id)).toEqual(["e1"]);
  });

  it("allows the reverse direction (b -> a) alongside a -> b", () => {
    const doc = docWithNodes("a", "b");
    expect(createEdge(doc, "e1", { source: "a", target: "b" }, LOCAL_ORIGIN)).toBe(true);
    expect(createEdge(doc, "e2", { source: "b", target: "a" }, LOCAL_ORIGIN)).toBe(true);
    expect(
      edgesForFlow(doc)
        .map((e) => e.id)
        .sort(),
    ).toEqual(["e1", "e2"]);
  });

  it("returns false when an endpoint node does not exist", () => {
    const doc = docWithNodes("a");
    expect(createEdge(doc, "e1", { source: "a", target: "missing" }, LOCAL_ORIGIN)).toBe(false);
    expect(createEdge(doc, "e2", { source: "missing", target: "a" }, LOCAL_ORIGIN)).toBe(false);
    expect(edgesForFlow(doc)).toEqual([]);
  });

  it("returns false when the edge id already exists", () => {
    const doc = docWithNodes("a", "b", "c");
    expect(createEdge(doc, "e1", { source: "a", target: "b" }, LOCAL_ORIGIN)).toBe(true);
    expect(createEdge(doc, "e1", { source: "a", target: "c" }, LOCAL_ORIGIN)).toBe(false);
    expect(flowEdge(doc, "e1")).toEqual({ id: "e1", source: "a", target: "b" });
  });

  it("keeps an explicit label", () => {
    const doc = docWithNodes("a", "b");
    createEdge(doc, "e1", { source: "a", target: "b", label: "yes" }, LOCAL_ORIGIN);
    expect(flowEdge(doc, "e1")).toEqual({ id: "e1", source: "a", target: "b", label: "yes" });
  });
});

describe("deleteEdge", () => {
  it("removes the edge", () => {
    const doc = new Y.Doc();
    createNode(doc, "a", { kind: "action", x: 0, y: 0 }, LOCAL_ORIGIN);
    createNode(doc, "b", { kind: "action", x: 0, y: 0 }, LOCAL_ORIGIN);
    createEdge(doc, "e1", { source: "a", target: "b" }, LOCAL_ORIGIN);

    deleteEdge(doc, "e1", LOCAL_ORIGIN);
    expect(edgesForFlow(doc)).toEqual([]);
  });
});

describe("deleteNode cascade", () => {
  it("removes the node plus every touching edge, in a single transaction", () => {
    const doc = new Y.Doc();
    createNode(doc, "A", { kind: "start", x: 0, y: 0 }, LOCAL_ORIGIN);
    createNode(doc, "B", { kind: "action", x: 10, y: 0 }, LOCAL_ORIGIN);
    createNode(doc, "C", { kind: "end", x: 20, y: 0 }, LOCAL_ORIGIN);
    createEdge(doc, "AB", { source: "A", target: "B" }, LOCAL_ORIGIN);
    createEdge(doc, "BC", { source: "B", target: "C" }, LOCAL_ORIGIN);

    let transactions = 0;
    const count = (): void => {
      transactions += 1;
    };
    doc.on("afterTransaction", count);
    deleteNode(doc, "B", LOCAL_ORIGIN);
    doc.off("afterTransaction", count);

    expect(transactions).toBe(1);
    expect(
      nodesForFlow(doc)
        .map((n) => n.id)
        .sort(),
    ).toEqual(["A", "C"]);
    expect(edgesForFlow(doc)).toEqual([]);
  });

  it("leaves unrelated edges alone", () => {
    const doc = new Y.Doc();
    for (const id of ["A", "B", "C", "D"]) {
      createNode(doc, id, { kind: "action", x: 0, y: 0 }, LOCAL_ORIGIN);
    }
    createEdge(doc, "AB", { source: "A", target: "B" }, LOCAL_ORIGIN);
    createEdge(doc, "CD", { source: "C", target: "D" }, LOCAL_ORIGIN);

    deleteNode(doc, "A", LOCAL_ORIGIN);

    expect(edgesForFlow(doc).map((e) => e.id)).toEqual(["CD"]);
    expect(
      nodesForFlow(doc)
        .map((n) => n.id)
        .sort(),
    ).toEqual(["B", "C", "D"]);
  });
});

describe("updateEdgeLabel", () => {
  function docWithEdge(): Y.Doc {
    const doc = new Y.Doc();
    createNode(doc, "a", { kind: "action", x: 0, y: 0 }, LOCAL_ORIGIN);
    createNode(doc, "b", { kind: "action", x: 0, y: 0 }, LOCAL_ORIGIN);
    createEdge(doc, "e1", { source: "a", target: "b" }, LOCAL_ORIGIN);
    return doc;
  }

  it("sets a non-empty label", () => {
    const doc = docWithEdge();
    updateEdgeLabel(doc, "e1", "x", LOCAL_ORIGIN);
    expect(flowEdge(doc, "e1")).toEqual({ id: "e1", source: "a", target: "b", label: "x" });
  });

  it("removes the label key when passed an empty string", () => {
    const doc = docWithEdge();
    updateEdgeLabel(doc, "e1", "x", LOCAL_ORIGIN);
    updateEdgeLabel(doc, "e1", "", LOCAL_ORIGIN);

    const edge = flowEdge(doc, "e1");
    expect(edge).toEqual({ id: "e1", source: "a", target: "b" });
    expect(edge && "label" in edge).toBe(false);

    // the underlying Y.Map key is gone, not just blank.
    const raw = getEdgesMap(doc).get("e1");
    expect(raw instanceof Y.Map && raw.has("label")).toBe(false);
  });
});

describe("origin plumbing", () => {
  it("passes the caller's origin through to the transaction", () => {
    const doc = new Y.Doc();
    const seen: unknown[] = [];
    doc.on("afterTransaction", (tx: Y.Transaction) => seen.push(tx.origin));

    createNode(doc, "n1", { kind: "action", x: 0, y: 0 }, LOCAL_ORIGIN);
    createNode(doc, "n2", { kind: "action", x: 0, y: 0 }, REMOTE);

    expect(seen).toContain(LOCAL_ORIGIN);
    expect(seen).toContain(REMOTE);
  });

  it("nodesForFlow / edgesForFlow ignore non-Y.Map junk written into the maps", () => {
    const doc = new Y.Doc();
    doc.transact(() => {
      getNodesMap(doc).set("bad", "not a map" as unknown as Y.Map<unknown>);
      getEdgesMap(doc).set("bad", 42 as unknown as Y.Map<unknown>);
    }, LOCAL_ORIGIN);

    expect(nodesForFlow(doc)).toEqual([]);
    expect(edgesForFlow(doc)).toEqual([]);
  });
});
