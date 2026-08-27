import { CreateBoardButton } from "./create-board-button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Multiplayer Visual Canvas</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          A real-time collaborative node canvas with an AI assistant. Phase 0 — foundations only:
          the canvas itself lands in Phase 1.
        </p>
      </div>
      <CreateBoardButton />
    </main>
  );
}
