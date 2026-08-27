"use client";

import { useEffect, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useYDoc } from "@/lib/canvas/ydoc";
import { applyAiGraph } from "@/lib/canvas/apply-ai-graph";
import type { AiGraph } from "@canvas/shared";

const EXAMPLES = [
  "Standard refund request process",
  "User onboarding with email verification",
  "CI pipeline: test, build, deploy",
];

export function AiPrompt() {
  const { boardId, doc, undoManager } = useYDoc();
  const { screenToFlowPosition } = useReactFlow();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dev-only: apply a graph object directly, bypassing the LLM call — lets the
  // layout + transaction path be exercised without an ANTHROPIC_API_KEY.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (globalThis as Record<string, unknown>).__aiApply = (graph: AiGraph) => {
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      return applyAiGraph(doc, undoManager, graph, center);
    };
  }, [doc, undoManager, screenToFlowPosition]);

  async function generate(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardId, prompt: value }),
      });
      const data = (await res.json()) as { graph?: unknown; error?: string };
      if (!res.ok || !data.graph) throw new Error(data.error ?? `Request failed (${res.status})`);

      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      await applyAiGraph(doc, undoManager, data.graph as never, center);
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-72 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void generate(prompt);
        }}
        className="flex gap-1.5"
      >
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe a process for the AI to sketch…"
          disabled={busy}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none placeholder:text-slate-400 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
        />
        <button
          type="submit"
          disabled={busy || !prompt.trim()}
          className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
        >
          {busy ? "…" : "Generate"}
        </button>
      </form>

      {error ? (
        <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setPrompt(ex);
                void generate(ex);
              }}
              disabled={busy}
              className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
