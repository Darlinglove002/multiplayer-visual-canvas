import { notFound } from "next/navigation";
import { pool } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { rows } = await pool.query<{ id: string; title: string }>(
    "select id, title from boards where id = $1",
    [id],
  );
  if (rows.length === 0) notFound();
  const board = rows[0]!;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold tracking-tight">{board.title}</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Board <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">{board.id}</code>{" "}
        exists. The collaborative canvas (React Flow + Yjs) renders here in Phase 1.
      </p>
    </main>
  );
}
