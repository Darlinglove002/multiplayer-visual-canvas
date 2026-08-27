"use client";

import { useEffect, useRef } from "react";
import type * as Y from "yjs";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";

/**
 * CodeMirror bound to a node's content Y.Text. Mounted only while a node is
 * being edited (double-click) — never one-per-node — so a board with many nodes
 * stays cheap.
 *
 * The board's per-client `Y.UndoManager` is passed to `yCollab`, which registers
 * the CM sync origin with it on mount and unregisters on unmount. Result:
 * typing is part of the same undo history as moving/adding nodes, and it's
 * still origin-scoped so Ctrl+Z never touches a collaborator's edits.
 */
export function NodeEditor({
  text,
  undoManager,
  onDone,
}: {
  text: Y.Text;
  undoManager: Y.UndoManager;
  onDone: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: text.toString(),
        extensions: [
          EditorView.lineWrapping,
          placeholder("Describe this step…"),
          yCollab(text, null, { undoManager }),
          keymap.of([
            { key: "Escape", run: () => (onDone(), true) },
            { key: "Mod-Enter", run: () => (onDone(), true) },
            ...yUndoManagerKeymap,
            ...defaultKeymap,
          ]),
          EditorView.domEventHandlers({
            blur: () => {
              onDone();
              return false;
            },
          }),
          EditorView.theme({
            "&": { fontSize: "13px", backgroundColor: "transparent" },
            "&.cm-focused": { outline: "none" },
            ".cm-content": { padding: 0, fontFamily: "inherit", caretColor: "currentColor" },
            ".cm-line": { padding: 0 },
            ".cm-placeholder": { color: "rgb(148 163 184)" },
          }),
        ],
      }),
    });

    view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.length } });

    return () => view.destroy();
  }, [text, undoManager, onDone]);

  return <div ref={host} className="nodrag w-full cursor-text leading-snug" />;
}
