"use client";

import { useSyncExternalStore } from "react";
import * as Y from "yjs";
import { NODE_KEYS, getNodeContent, getNodesMap } from "@canvas/shared";
import { useYDoc } from "./ydoc";

/** Live text of a node's content Y.Text — for the static (non-editing) render. */
export function useNodeText(id: string): string {
  const { doc } = useYDoc();
  return useSyncExternalStore(
    (onChange) => {
      const text = getNodeContent(doc, id);
      if (!text) return () => {};
      text.observe(onChange);
      return () => text.unobserve(onChange);
    },
    () => getNodeContent(doc, id)?.toString() ?? "",
    () => "",
  );
}

/** Live scalar field of a node (`color` or `kind`). */
export function useNodeField(id: string, key: "color" | "kind"): string {
  const { doc } = useYDoc();
  return useSyncExternalStore(
    (onChange) => {
      const node = getNodesMap(doc).get(id);
      if (!(node instanceof Y.Map)) return () => {};
      node.observe(onChange);
      return () => node.unobserve(onChange);
    },
    () => {
      const node = getNodesMap(doc).get(id);
      return (node instanceof Y.Map ? ((node.get(NODE_KEYS[key]) as string) ?? "") : "");
    },
    () => "",
  );
}
