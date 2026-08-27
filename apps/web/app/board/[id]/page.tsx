import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { BoardCanvasLoader } from "@/components/canvas/board-canvas-loader";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { rows } = await pool.query<{ id: string }>("select id from boards where id = $1", [id]);
  if (rows.length === 0) notFound();

  return <BoardCanvasLoader boardId={id} />;
}
