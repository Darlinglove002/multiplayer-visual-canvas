"use client";

import { ViewportPortal } from "@xyflow/react";
import { useOthers } from "@/lib/canvas/presence";

/**
 * Other users' cursors, rendered in flow-coordinate space. <ViewportPortal>
 * applies React Flow's pan/zoom transform for us, so we position at raw flow
 * coords and they track the canvas.
 */
export function PresenceCursors() {
  const others = useOthers();

  return (
    <ViewportPortal>
      {others.map((o) =>
        o.cursor ? (
          <div
            key={o.clientId}
            className="pointer-events-none absolute left-0 top-0 z-50 select-none"
            style={{
              transform: `translate(${o.cursor.x}px, ${o.cursor.y}px)`,
              transition: "transform 80ms linear",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="drop-shadow">
              <path
                d="M2 2l6.5 14 2-6 6-2L2 2z"
                fill={o.color}
                stroke="white"
                strokeWidth="1.25"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="ml-3 mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ background: o.color }}
            >
              {o.name}
            </span>
          </div>
        ) : null,
      )}
    </ViewportPortal>
  );
}
