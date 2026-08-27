import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { boardMutateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

// Rename a board. No auth (there is none) — like the canvas itself, anyone with
// the board's id can do it. Cosmetic only; the id never changes.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { success } = await boardMutateLimit.limit(clientIp(request));
  if (!success) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const { rowCount } = await pool.query("update boards set title = $1 where id = $2", [
    parsed.data.title,
    id,
  ]);
  if (!rowCount) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, title: parsed.data.title });
}
