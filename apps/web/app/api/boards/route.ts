import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { boardCreateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Runtime-validated, not just typed — a body shape from `as` is a compile-time
// fiction, this actually checks what arrived.
const bodySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

// GET /api/boards?ids=a,b,c — hydrate the dashboard's localStorage list. Only
// returns boards that exist; capped so the list can't be used to enumerate.
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.split(",").map((s) => s.trim()))]
    .filter((s) => UUID_RE.test(s))
    .slice(0, 30);
  if (ids.length === 0) return NextResponse.json({ boards: [] });

  const { rows } = await pool.query(
    `select b.id, b.title, b.last_activity_at,
            coalesce(bd.snapshot, '{"nodes":[],"edges":[]}'::jsonb) as snapshot
       from boards b
       left join board_documents bd on bd.board_id = b.id
      where b.id = any($1::uuid[])
      order by b.last_activity_at desc`,
    [ids],
  );
  return NextResponse.json({ boards: rows });
}

export async function POST(request: Request) {
  const { success, reset } = await boardCreateLimit.limit(clientIp(request));
  if (!success) {
    return NextResponse.json(
      { error: "Too many boards created from this address. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const title = parsed.data.title ?? "Untitled board";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: string }>(
      "insert into boards (title) values ($1) returning id",
      [title],
    );
    const boardId = rows[0]!.id;
    await client.query("insert into board_documents (board_id) values ($1)", [boardId]);
    await client.query("commit");
    return NextResponse.json({ id: boardId, title }, { status: 201 });
  } catch (err) {
    await client.query("rollback").catch(() => {});
    console.error("[api/boards] create failed", err);
    return NextResponse.json({ error: "Failed to create board" }, { status: 500 });
  } finally {
    client.release();
  }
}
