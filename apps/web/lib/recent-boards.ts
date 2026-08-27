"use client";

// The dashboard shows the boards *this browser* has created or opened — there
// are no accounts, and a board's URL is its only access credential, so a global
// list would just expose everyone's boards. Kept in localStorage.

const KEY = "canvas:recent-boards";
const MAX = 60;

type Recent = { id: string; openedAt: number };

function read(): Recent[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as Recent[]).filter((r) => r && typeof r.id === "string") : [];
  } catch {
    return [];
  }
}

function write(list: Recent[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // no localStorage (private mode) — the dashboard just stays empty
  }
}

export function getRecentBoardIds(limit = 24): string[] {
  return read()
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, limit)
    .map((r) => r.id);
}

export function rememberBoard(id: string): void {
  write([{ id, openedAt: Date.now() }, ...read().filter((r) => r.id !== id)]);
}

export function forgetBoard(id: string): void {
  write(read().filter((r) => r.id !== id));
}
