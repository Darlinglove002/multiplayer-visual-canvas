"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { LOCAL_ORIGIN, getEdgesMap, getNodesMap } from "@canvas/shared";

type Store = {
  doc: Y.Doc;
  undoManager: Y.UndoManager;
  persistence: IndexeddbPersistence;
};

type YDocContextValue = Store & { synced: boolean };

const YDocContext = createContext<YDocContextValue | null>(null);

// Module-level cache keyed by board id. An effect owns the refcount; teardown is
// deferred so React Strict Mode's dev mount → unmount → remount doesn't destroy
// and rebuild the Y.Doc, while a real navigation / board switch still frees it.
type Entry = Store & { refCount: number; teardown?: ReturnType<typeof setTimeout> };
const cache = new Map<string, Entry>();

function getOrCreate(boardId: string): Entry {
  const existing = cache.get(boardId);
  if (existing) return existing;
  const doc = new Y.Doc();
  const undoManager = new Y.UndoManager([getNodesMap(doc), getEdgesMap(doc)], {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
    captureTimeout: 350,
  });
  const persistence = new IndexeddbPersistence(`canvas:${boardId}`, doc);
  const entry: Entry = { doc, undoManager, persistence, refCount: 0 };
  cache.set(boardId, entry);
  return entry;
}

function acquire(boardId: string): Entry {
  const entry = getOrCreate(boardId);
  if (entry.teardown) {
    clearTimeout(entry.teardown);
    entry.teardown = undefined;
  }
  entry.refCount += 1;
  return entry;
}

function release(boardId: string) {
  const entry = cache.get(boardId);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  entry.teardown = setTimeout(() => {
    if (cache.get(boardId) === entry && entry.refCount === 0) {
      entry.undoManager.destroy();
      void entry.persistence.destroy();
      entry.doc.destroy();
      cache.delete(boardId);
    }
  }, 1000);
}

/**
 * Owns the board's Y.Doc, its IndexedDB persistence, and the undo manager.
 * Pass a stable `key={boardId}` so switching boards remounts this provider.
 */
export function YDocProvider({
  boardId,
  children,
}: {
  boardId: string;
  children: ReactNode;
}) {
  const [entry] = useState(() => getOrCreate(boardId));
  const [synced, setSynced] = useState(() => entry.persistence.synced);

  useEffect(() => {
    const held = acquire(boardId);

    if (process.env.NODE_ENV !== "production") {
      (globalThis as Record<string, unknown>).__canvas = held;
    }

    // `synced` is seeded from persistence in useState; this covers the doc
    // finishing its IndexedDB load after mount. whenSynced resolves immediately
    // if it was already done, so the update lands on the next tick either way.
    let live = true;
    void held.persistence.whenSynced.then(() => {
      if (live) setSynced(true);
    });

    return () => {
      live = false;
      release(boardId);
    };
  }, [boardId]);

  const value = useMemo<YDocContextValue>(
    () => ({
      doc: entry.doc,
      undoManager: entry.undoManager,
      persistence: entry.persistence,
      synced,
    }),
    [entry, synced],
  );

  return <YDocContext.Provider value={value}>{children}</YDocContext.Provider>;
}

export function useYDoc(): YDocContextValue {
  const ctx = useContext(YDocContext);
  if (!ctx) throw new Error("useYDoc must be used within <YDocProvider>");
  return ctx;
}
