"use client";

// A lightweight anonymous identity for presence — no accounts (see AGENTS.md).
// Persisted per browser so your name/color survive a refresh.

export type Identity = {
  clientId: string;
  name: string;
  color: string;
};

const STORAGE_KEY = "canvas:identity";

const ADJECTIVES = ["Swift", "Quiet", "Bright", "Bold", "Calm", "Keen", "Warm", "Deep"];
const ANIMALS = ["Otter", "Falcon", "Maple", "Heron", "Lynx", "Wren", "Ibex", "Moth"];
const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function create(): Identity {
  return {
    clientId:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`,
    color: pick(COLORS),
  };
}

export function getIdentity(): Identity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Identity>;
      if (parsed.clientId && parsed.name && parsed.color) return parsed as Identity;
    }
  } catch {
    // no localStorage (private mode, etc.) — fall through to an ephemeral one
  }
  const identity = create();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // ignore
  }
  return identity;
}
