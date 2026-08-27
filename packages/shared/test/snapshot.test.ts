import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  canvasSnapshotSchema,
  createEdge,
  createNode,
  DEFAULT_NODE_COLOR,
  kindColor,
  LOCAL_ORIGIN,
  snapshotFromDoc,
  updateEdgeLabel,
} from "../src/index";
import type { NodeKind } from "../src/index";

describe("kindColor", () => {
  it("returns a distinct #rrggbb hex per known kind", () => {
    const colors: Record<NodeKind, string> = {
      start: kindColor("start"),
      action: kindColor("action"),
      decision: kindColor("decision"),
      end: kindColor("end"),
    };

    for (const value of Object.values(colors)) {
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    expect(new Set(Object.values(colors)).size).toBe(4);
    expect(colors.start).toBe("#10b981");
    expect(colors.action).toBe("#6366f1");
    expect(colors.decision).toBe("#f59e0b");
    expect(colors.end).toBe("#ef4444");
  });

  it("falls back to DEFAULT_NODE_COLOR for an unknown kind", () => {
    expect(kindColor("mystery" as NodeKind)).toBe(DEFAULT_NODE_COLOR);
  });
});

describe("snapshotFromDoc", () => {
  function populatedDoc(): Y.Doc {
    const doc = new Y.Doc();
    createNode(
      doc,
      "start",
      { kind: "start", x: 0, y: 0, content: "Получить заявку" },
      LOCAL_ORIGIN,
    );
    createNode(
      doc,
      "act",
      { kind: "action", x: 120, y: 0, color: "#6366f1", content: "Review" },
      LOCAL_ORIGIN,
    );
    createNode(doc, "done", { kind: "end", x: 240, y: 0 }, LOCAL_ORIGIN);
    createEdge(doc, "e1", { source: "start", target: "act", label: "new" }, LOCAL_ORIGIN);
    createEdge(doc, "e2", { source: "act", target: "done" }, LOCAL_ORIGIN);
    return doc;
  }

  it("matches canvasSnapshotSchema for a populated doc", () => {
    const result = canvasSnapshotSchema.safeParse(snapshotFromDoc(populatedDoc()));
    expect(result.success).toBe(true);
  });

  it("matches canvasSnapshotSchema for an empty doc", () => {
    const result = canvasSnapshotSchema.safeParse(snapshotFromDoc(new Y.Doc()));
    expect(result.success).toBe(true);
  });

  it("preserves a non-ASCII content string as a plain string", () => {
    const snap = snapshotFromDoc(populatedDoc());
    const start = snap.nodes.find((n) => n.id === "start");
    expect(start?.content).toBe("Получить заявку");
  });

  it("omits the label key for an unlabeled edge and keeps it for a labeled one", () => {
    const snap = snapshotFromDoc(populatedDoc());
    const labeled = snap.edges.find((e) => e.id === "e1");
    const bare = snap.edges.find((e) => e.id === "e2");

    expect(labeled).toEqual({ id: "e1", source: "start", target: "act", label: "new" });
    expect(bare).toEqual({ id: "e2", source: "act", target: "done" });
    expect(bare && "label" in bare).toBe(false);
  });

  it("drops a label that was cleared back to an empty string", () => {
    const doc = populatedDoc();
    updateEdgeLabel(doc, "e1", "", LOCAL_ORIGIN);

    const snap = snapshotFromDoc(doc);
    const edge = snap.edges.find((e) => e.id === "e1");
    expect(edge && "label" in edge).toBe(false);
    expect(canvasSnapshotSchema.safeParse(snap).success).toBe(true);
  });
});
