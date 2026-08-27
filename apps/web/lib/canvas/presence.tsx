"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useYDoc } from "./ydoc";

export type Cursor = { x: number; y: number };
export type RemotePresence = {
  clientId: number;
  name: string;
  color: string;
  cursor: Cursor | null;
};
export type RemoteEditor = { name: string; color: string };

type Actions = {
  setCursor: (c: Cursor | null) => void;
  setEditing: (nodeId: string | null) => void;
};

type AwarenessUserState = {
  user?: { name?: string; color?: string };
  cursor?: Cursor | null;
  editingNodeId?: string | null;
};

const OthersContext = createContext<RemotePresence[]>([]);
const EditorsContext = createContext<Map<string, RemoteEditor>>(new Map());
const ActionsContext = createContext<Actions | null>(null);

/**
 * One awareness subscription for the whole canvas, split across three contexts:
 *
 * - `useOthers()` changes on every cursor move — consumed only by the cursor
 *   overlay and the status pill.
 * - `useEditors()` changes only when someone starts/stops editing a node —
 *   consumed per-node without re-rendering on cursor movement.
 * - `usePresenceActions()` is stable.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { awareness } = useYDoc();
  const [others, setOthers] = useState<RemotePresence[]>([]);
  const [editors, setEditors] = useState<Map<string, RemoteEditor>>(new Map());

  useEffect(() => {
    let editorsKey = "";
    const update = () => {
      const list: RemotePresence[] = [];
      const ed = new Map<string, RemoteEditor>();
      awareness.getStates().forEach((raw, clientId) => {
        if (clientId === awareness.clientID) return;
        const s = raw as AwarenessUserState;
        if (!s.user) return;
        const name = s.user.name ?? "Anon";
        const color = s.user.color ?? "#94a3b8";
        list.push({ clientId, name, color, cursor: s.cursor ?? null });
        if (s.editingNodeId) ed.set(s.editingNodeId, { name, color });
      });
      setOthers(list);
      const key = [...ed.entries()]
        .map(([k, v]) => `${k}:${v.name}`)
        .sort()
        .join("|");
      if (key !== editorsKey) {
        editorsKey = key;
        setEditors(ed);
      }
    };
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [awareness]);

  const lastCursorSent = useRef(0);
  const actions = useMemo<Actions>(
    () => ({
      setCursor: (c) => {
        const now = Date.now();
        if (c && now - lastCursorSent.current < 40) return;
        lastCursorSent.current = now;
        awareness.setLocalStateField("cursor", c);
      },
      setEditing: (nodeId) => awareness.setLocalStateField("editingNodeId", nodeId),
    }),
    [awareness],
  );

  return (
    <ActionsContext.Provider value={actions}>
      <EditorsContext.Provider value={editors}>
        <OthersContext.Provider value={others}>{children}</OthersContext.Provider>
      </EditorsContext.Provider>
    </ActionsContext.Provider>
  );
}

export const useOthers = () => useContext(OthersContext);
export const useEditors = () => useContext(EditorsContext);

export function usePresenceActions(): Actions {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error("usePresenceActions must be used within <PresenceProvider>");
  return ctx;
}
