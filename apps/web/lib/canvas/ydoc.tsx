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
import { HocuspocusProvider } from "@hocuspocus/provider";
import type { Awareness } from "y-protocols/awareness";
import { LOCAL_ORIGIN, getEdgesMap, getNodesMap } from "@canvas/shared";
import { getIdentity } from "./identity";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

type Store = {
  doc: Y.Doc;
  undoManager: Y.UndoManager;
  persistence: IndexeddbPersistence;
  provider: HocuspocusProvider;
  awareness: Awareness;
};

type YDocContextValue = Store & {
  boardId: string;
  synced: boolean;
  status: ConnectionStatus;
};

const YDocContext = createContext<YDocContextValue | null>(null);

const SYNC_URL = process.env.NEXT_PUBLIC_SYNC_URL ?? "ws://localhost:1234";

// Module-level cache keyed by board id. An effect owns the refcount; teardown is
// deferred so React Strict Mode's dev mount → unmount → remount doesn't tear
// down the socket, while a real navigation / board switch still frees it.
type Entry = Store & {
  refCount: number;
  status: ConnectionStatus;
  teardown?: ReturnType<typeof setTimeout>;
  // Set by the currently-mounted provider so onStatus can push updates to React.
  onStatusChange?: (s: ConnectionStatus) => void;
};
const cache = new Map<string, Entry>();

function getOrCreate(boardId: string): Entry {
  const existing = cache.get(boardId);
  if (existing) return existing;

  const doc = new Y.Doc();
  const undoManager = new Y.UndoManager([getNodesMap(doc), getEdgesMap(doc)], {
    // Only this client's edits are tracked. Remote updates arrive with the
    // Hocuspocus provider (or IndexedDB) as their transaction origin, so Ctrl+Z
    // can never revert a collaborator's work.
    trackedOrigins: new Set([LOCAL_ORIGIN]),
    captureTimeout: 350,
  });
  const persistence = new IndexeddbPersistence(`canvas:${boardId}`, doc);
  const provider = new HocuspocusProvider({
    url: SYNC_URL,
    name: boardId,
    document: doc,
    token: "anonymous",
    onStatus: ({ status }) => {
      const entry = cache.get(boardId);
      if (entry) {
        entry.status = status as ConnectionStatus;
        entry.onStatusChange?.(status as ConnectionStatus);
      }
    },
  });
  const awareness = provider.awareness!;
  const identity = getIdentity();
  awareness.setLocalStateField("user", { name: identity.name, color: identity.color });

  const entry: Entry = {
    doc,
    undoManager,
    persistence,
    provider,
    awareness,
    refCount: 0,
    status: "connecting",
  };
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
      entry.provider.destroy();
      void entry.persistence.destroy();
      entry.doc.destroy();
      cache.delete(boardId);
    }
  }, 1000);
}

/**
 * Owns the board's Y.Doc, IndexedDB persistence, the Hocuspocus provider (+ its
 * awareness), and the per-client undo manager. Pass a stable `key={boardId}`.
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
  const [status, setStatus] = useState<ConnectionStatus>(() => entry.status);

  useEffect(() => {
    const held = acquire(boardId);
    // `status` is seeded from the entry in useState; further changes arrive
    // through this callback (the provider connects a beat after mount anyway).
    held.onStatusChange = setStatus;

    if (process.env.NODE_ENV !== "production") {
      (globalThis as Record<string, unknown>).__canvas = held;
    }

    let live = true;
    void held.persistence.whenSynced.then(() => {
      if (live) setSynced(true);
    });

    return () => {
      live = false;
      if (held.onStatusChange === setStatus) held.onStatusChange = undefined;
      release(boardId);
    };
  }, [boardId]);

  const value = useMemo<YDocContextValue>(
    () => ({
      boardId,
      doc: entry.doc,
      undoManager: entry.undoManager,
      persistence: entry.persistence,
      provider: entry.provider,
      awareness: entry.awareness,
      synced,
      status,
    }),
    [boardId, entry, synced, status],
  );

  return <YDocContext.Provider value={value}>{children}</YDocContext.Provider>;
}

export function useYDoc(): YDocContextValue {
  const ctx = useContext(YDocContext);
  if (!ctx) throw new Error("useYDoc must be used within <YDocProvider>");
  return ctx;
}
