"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { rememberBoard } from "@/lib/recent-boards";

// The canvas is Yjs + IndexedDB + WebSocket — none of which exist on the server.
// Load it client-only so Next never tries to SSR a Y.Doc / provider / persistence
// (which throws `indexedDB is not defined` and opens a phantom socket).
const BoardCanvas = dynamic(
  () => import("./board-canvas").then((m) => m.BoardCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-dvh w-screen place-items-center bg-[var(--canvas-bg)]">
        <span className="text-sm text-slate-400">Loading canvas…</span>
      </div>
    ),
  },
);

export function BoardCanvasLoader({ boardId }: { boardId: string }) {
  useEffect(() => {
    rememberBoard(boardId);
  }, [boardId]);
  return <BoardCanvas boardId={boardId} />;
}
