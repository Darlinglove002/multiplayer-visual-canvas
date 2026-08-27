import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  createEdge,
  createNode,
  deleteNode,
  edgesForFlow,
  getEdgesMap,
  getNodesMap,
  LOCAL_ORIGIN,
  nodesForFlow,
  updateNodePosition,
} from "../src/index";

/**
 * Mirrors the UndoManager wiring in apps/web/lib/canvas/ydoc.tsx:
 * scoped to the nodes + edges maps, tracking only LOCAL_ORIGIN, capture 350ms.
 */
function makeUndoManager(doc: Y.Doc): Y.UndoManager {
  return new Y.UndoManager([getNodesMap(doc), getEdgesMap(doc)], {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
    captureTimeout: 350,
  });
}

function nodeIds(doc: Y.Doc): string[] {
  return nodesForFlow(doc)
    .map((n) => n.id)
    .sort();
}

describe("undo / redo of local mutations", () => {
  it("undo removes a locally created node, redo brings it back", () => {
    const doc = new Y.Doc();
    const undo = makeUndoManager(doc);

    createNode(doc, "n1", { kind: "start", x: 0, y: 0 }, LOCAL_ORIGIN);
    expect(nodeIds(doc)).toEqual(["n1"]);

    undo.undo();
    expect(nodeIds(doc)).toEqual([]);

    undo.redo();
    expect(nodeIds(doc)).toEqual(["n1"]);
  });

  it("undo of a cascading deleteNode restores the node and both edges in one step", () => {
    const doc = new Y.Doc();
    const undo = makeUndoManager(doc);

    createNode(doc, "A", { kind: "start", x: 0, y: 0 }, LOCAL_ORIGIN);
    createNode(doc, "B", { kind: "action", x: 10, y: 0 }, LOCAL_ORIGIN);
    createNode(doc, "C", { kind: "end", x: 20, y: 0 }, LOCAL_ORIGIN);
    createEdge(doc, "AB", { source: "A", target: "B" }, LOCAL_ORIGIN);
    createEdge(doc, "BC", { source: "B", target: "C" }, LOCAL_ORIGIN);
    undo.stopCapturing();

    deleteNode(doc, "B", LOCAL_ORIGIN);
    expect(nodeIds(doc)).toEqual(["A", "C"]);
    expect(edgesForFlow(doc)).toEqual([]);

    undo.undo();
    expect(nodeIds(doc)).toEqual(["A", "B", "C"]);
    expect(
      edgesForFlow(doc)
        .map((e) => e.id)
        .sort(),
    ).toEqual(["AB", "BC"]);
  });
});

describe("multiplayer safety: undo never reverts another origin's change", () => {
  it("a string-origin (collaborator) node survives a local undo()", () => {
    const doc = new Y.Doc();
    const undo = makeUndoManager(doc);

    createNode(doc, "remote", { kind: "action", x: 0, y: 0 }, "remote");
    expect(undo.canUndo()).toBe(false);

    undo.undo(); // nothing tracked -> no-op
    expect(nodeIds(doc)).toEqual(["remote"]);
  });

  it("a Symbol-origin node survives a local undo()", () => {
    const doc = new Y.Doc();
    const undo = makeUndoManager(doc);

    createNode(doc, "remote", { kind: "action", x: 0, y: 0 }, Symbol("remote"));
    expect(undo.canUndo()).toBe(false);
    undo.undo();
    expect(nodeIds(doc)).toEqual(["remote"]);
  });

  it("with interleaved local + remote edits, undo pops only the local one", () => {
    const doc = new Y.Doc();
    const undo = makeUndoManager(doc);

    createNode(doc, "remote-1", { kind: "action", x: 0, y: 0 }, "remote");
    createNode(doc, "local-1", { kind: "action", x: 0, y: 0 }, LOCAL_ORIGIN);
    undo.stopCapturing();
    createNode(doc, "remote-2", { kind: "action", x: 0, y: 0 }, "remote");

    expect(undo.undoStack.length).toBe(1);

    undo.undo();
    expect(nodeIds(doc)).toEqual(["remote-1", "remote-2"]);

    undo.redo();
    expect(nodeIds(doc)).toEqual(["local-1", "remote-1", "remote-2"]);
  });

  it("a remote position change on a locally created node is not reverted by undo()", () => {
    const doc = new Y.Doc();
    const undo = makeUndoManager(doc);

    createNode(doc, "n1", { kind: "action", x: 1, y: 1 }, LOCAL_ORIGIN);
    undo.stopCapturing();
    updateNodePosition(doc, "n1", 500, 600, "remote");

    undo.undo(); // pops the createNode step -> node removed entirely

    // The node is gone (its creation was local), but crucially the *remote*
    // move was never queued as its own undo step.
    expect(nodeIds(doc)).toEqual([]);
    expect(undo.undoStack.length).toBe(0);

    undo.redo();
    // redo restores the node; Yjs keeps the last-written (remote) position.
    expect(nodesForFlow(doc)[0]).toMatchObject({ x: 500, y: 600 });
  });
});

describe("captureTimeout batching", () => {
  it("two rapid position updates collapse into one undo step", () => {
    const doc = new Y.Doc();
    const undo = makeUndoManager(doc);

    createNode(doc, "n1", { kind: "action", x: 0, y: 0 }, LOCAL_ORIGIN);
    undo.stopCapturing(); // close the create step

    updateNodePosition(doc, "n1", 10, 10, LOCAL_ORIGIN);
    updateNodePosition(doc, "n1", 20, 20, LOCAL_ORIGIN);

    // create + (merged move) == 2 steps, not 3.
    expect(undo.undoStack.length).toBe(2);

    undo.undo();
    expect(nodesForFlow(doc)[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("stopCapturing() between updates forces separate undo steps", () => {
    const doc = new Y.Doc();
    const undo = makeUndoManager(doc);

    createNode(doc, "n1", { kind: "action", x: 0, y: 0 }, LOCAL_ORIGIN);
    undo.stopCapturing();

    updateNodePosition(doc, "n1", 10, 10, LOCAL_ORIGIN);
    undo.stopCapturing();
    updateNodePosition(doc, "n1", 20, 20, LOCAL_ORIGIN);

    expect(undo.undoStack.length).toBe(3);

    undo.undo();
    expect(nodesForFlow(doc)[0]).toMatchObject({ x: 10, y: 10 });

    undo.undo();
    expect(nodesForFlow(doc)[0]).toMatchObject({ x: 0, y: 0 });
  });
});
