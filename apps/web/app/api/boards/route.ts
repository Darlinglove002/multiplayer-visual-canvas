import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { boardCreateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Runtime-validated, not just typed — a body shape from `as` is a compile-time
// fiction, this actually checks what arrived.
const bodySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

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
