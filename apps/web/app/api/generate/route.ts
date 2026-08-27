import { NextResponse } from "next/server";
import { z } from "zod";
import { EMPTY_SNAPSHOT, canvasSnapshotSchema } from "@canvas/shared";
import { pool } from "@/lib/db";
import { aiGenerateLimit, clientIp } from "@/lib/ratelimit";
import { generateGraph } from "@/lib/ai/generate";

export const runtime = "nodejs";
// The model call can take a while — give the function room (Vercel).
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  boardId: z.string().regex(UUID_RE),
  prompt: z.string().trim().min(3).max(1000),
});

const STATUS: Record<string, number> = {
  auth: 503,
  rate_limited: 429,
  refusal: 422,
  invalid_output: 422,
  api_error: 502,
};

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { boardId, prompt } = parsed.data;

  // Each call is a real, billed Anthropic request behind a public-ish endpoint.
  const { success, reset } = await aiGenerateLimit.limit(clientIp(request));
  if (!success) {
    return NextResponse.json(
      { error: "You've hit the generation limit. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))) },
      },
    );
  }

  const { rows } = await pool.query<{ snapshot: unknown }>(
    "select snapshot from board_documents where board_id = $1",
    [boardId],
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }
  const snap = canvasSnapshotSchema.safeParse(rows[0]!.snapshot);
  const snapshot = snap.success ? snap.data : EMPTY_SNAPSHOT;

  const result = await generateGraph(prompt, snapshot);
  if (!result.ok) {
    const message =
      result.reason === "auth"
        ? "The AI layer isn't configured — set ANTHROPIC_API_KEY in apps/web/.env.local."
        : `Couldn't generate a graph (${result.reason}).`;
    return NextResponse.json(
      { error: message, reason: result.reason },
      { status: STATUS[result.reason] ?? 500 },
    );
  }

  return NextResponse.json({ graph: result.graph });
}
