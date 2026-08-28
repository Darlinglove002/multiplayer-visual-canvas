"use client";

import { useState } from "react";

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked — nothing sensible to do
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy this board's link — anyone with it can edit"
      className="rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:bg-slate-900"
    >
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
