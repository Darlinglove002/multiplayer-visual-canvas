"use client";

import Link from "next/link";
import { useState } from "react";
import type { CanvasSnapshot } from "@canvas/shared";
import { BoardPreview } from "./board-preview";

export type BoardSummary = {
  id: string;
  title: string;
  last_activity_at: string;
  snapshot: CanvasSnapshot;
};

function relativeTime(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function BoardCard({
  board,
  onRename,
}: {
  board: BoardSummary;
  onRename: (id: string, title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const count = board.snapshot?.nodes?.length ?? 0;

  return (
    <div className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
      <Link href={`/board/${board.id}`} className="block">
        <div className="aspect-[16/10] border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
          <BoardPreview snapshot={board.snapshot} className="h-full w-full" />
        </div>
      </Link>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        {editing ? (
          <input
            autoFocus
            defaultValue={board.title}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== board.title) onRename(board.id, v);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-sm outline-none dark:border-slate-600 dark:bg-slate-800"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Rename"
            className="min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-800 hover:underline dark:text-slate-100"
          >
            {board.title}
          </button>
        )}
        <span className="shrink-0 text-xs text-slate-400">
          {count} block{count === 1 ? "" : "s"} · {relativeTime(board.last_activity_at)}
        </span>
      </div>
    </div>
  );
}
