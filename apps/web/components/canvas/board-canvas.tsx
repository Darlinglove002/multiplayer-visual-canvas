"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { YDocProvider } from "@/lib/canvas/ydoc";
import { Canvas } from "./canvas";

export function BoardCanvas({ boardId }: { boardId: string }) {
  return (
    <ReactFlowProvider>
      {/* key remounts the whole doc/persistence/undo stack when the board changes */}
      <YDocProvider key={boardId} boardId={boardId}>
        <Canvas />
      </YDocProvider>
    </ReactFlowProvider>
  );
}
