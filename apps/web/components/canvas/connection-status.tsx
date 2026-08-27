"use client";

import { useYDoc } from "@/lib/canvas/ydoc";
import { useOthers } from "@/lib/canvas/presence";

const DOT: Record<string, string> = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-500",
  disconnected: "bg-red-500",
};

export function ConnectionStatus() {
  const { status } = useYDoc();
  const others = useOthers();

  const label =
    status === "connected"
      ? others.length > 0
        ? `${others.length + 1} online`
        : "connected"
      : status === "connecting"
        ? "connecting…"
        : "offline";

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/90 px-2 py-1 text-xs text-slate-600 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status] ?? "bg-slate-400"}`} />
      <span>{label}</span>
      {others.length > 0 && (
        <span className="ml-1 flex -space-x-1">
          {others.slice(0, 4).map((o) => (
            <span
              key={o.clientId}
              title={o.name}
              className="inline-block h-3.5 w-3.5 rounded-full border border-white dark:border-slate-900"
              style={{ background: o.color }}
            />
          ))}
        </span>
      )}
    </div>
  );
}
