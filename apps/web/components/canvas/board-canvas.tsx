"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { YDocProvider } from "@/lib/canvas/ydoc";
import { PresenceProvider } from "@/lib/canvas/presence";
import { Canvas } from "./canvas";

export function BoardCanvas({ boardId }: { boardId: string }) {
  return (
    <ReactFlowProvider>
      {/* key remounts the whole doc/persistence/undo/socket stack per board */}
      <YDocProvider key={boardId} boardId={boardId}>
        <PresenceProvider>
          <Canvas />
        </PresenceProvider>
      </YDocProvider>
    </ReactFlowProvider>
  );
}
