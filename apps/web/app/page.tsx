"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRecentBoardIds, rememberBoard } from "@/lib/recent-boards";
import { BoardCard, type BoardSummary } from "@/components/board-card";

export default function DashboardPage() {
  const router = useRouter();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The API returns [] for an empty id list, so there's one async path here
    // and no synchronous setState in the effect body.
    fetch(`/api/boards?ids=${getRecentBoardIds().join(",")}`)
      .then((r) => r.json() as Promise<{ boards?: BoardSummary[] }>)
      .then((d) => {
        if (!cancelled) setBoards(d.boards ?? []);
      })
      .catch(() => {
        if (!cancelled) setBoards([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createBoard = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? `Request failed (${res.status})`);
      rememberBoard(data.id);
      router.push(`/board/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setCreating(false);
    }
  };

  const rename = async (id: string, title: string) => {
    setBoards((prev) => prev?.map((b) => (b.id === id ? { ...b, title } : b)) ?? null);
    await fetch(`/api/boards/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => {});
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Multiplayer Visual Canvas</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Your recent boards. A board&apos;s link is its key — anyone who has it can edit.
          </p>
        </div>
        <button
          type="button"
          onClick={createBoard}
          disabled={creating}
          className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {creating ? "Creating…" : "New board"}
        </button>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {boards === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : boards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-400 dark:border-slate-700">
          No boards here yet — create one, or open a board link someone shared with you.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <BoardCard key={b.id} board={b} onRename={rename} />
          ))}
        </div>
      )}
    </main>
  );
}
