import { NextResponse } from "next/server";
import { z } from "zod";
import { EMPTY_SNAPSHOT, canvasSnapshotSchema } from "@canvas/shared";
import { pool } from "@/lib/db";
import { aiDailyBudget, aiGenerateLimit, aiMonthlyBudget, clientIp, type Limiter } from "@/lib/ratelimit";
import { generateGraph } from "@/lib/ai/generate";

export const runtime = "nodejs";
// The model call can take a while — give the function room (Vercel).
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  boardId: z.string().regex(UUID_RE),
  prompt: z.string().trim().min(3).max(1000),
});

const FAILURE: Record<string, { status: number; message: string }> = {
  auth: {
    status: 503,
    message: "The AI assistant isn't set up — add ANTHROPIC_API_KEY to apps/web/.env.local.",
  },
  rate_limited: {
    status: 429,
    message: "You've hit the generation limit. Try again in a little while.",
  },
  refusal: {
    status: 422,
    message: "Couldn't turn that into a flowchart. Try describing a process, like “refund request handling”.",
  },
  invalid_output: {
    status: 422,
    message: "Couldn't turn that into a flowchart. Try describing a process, like “user signup with email verification”.",
  },
  api_error: { status: 502, message: "The AI service had a hiccup. Try again." },
};

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { boardId, prompt } = parsed.data;

  // Each call is a real, billed Anthropic request behind a public-ish endpoint.
  // Three gates: per visitor, then the daily and 30-day budgets shared by all
  // visitors (the ones that actually bound the bill). The limiter fails closed:
  // if it can't be reached, no billed call is made.
  const ip = clientIp(request);
  const gates: [string, Limiter, string][] = [
    ["visitor", aiGenerateLimit, "You've hit the generation limit. Try again later."],
    ["daily", aiDailyBudget, "The AI assistant has reached its daily budget for this demo. Everything else still works — try again tomorrow."],
    ["monthly", aiMonthlyBudget, "The AI assistant has reached its monthly budget for this demo. Everything else still works."],
  ];
  for (const [, limiter, message] of gates) {
    let result;
    try {
      result = await limiter.limit(limiter === aiGenerateLimit ? ip : "all");
    } catch {
      return NextResponse.json({ error: "The AI assistant is temporarily unavailable." }, { status: 503 });
    }
    if (!result.success) {
      return NextResponse.json(
        { error: message },
        {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))) },
        },
      );
    }
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
    const failure = FAILURE[result.reason] ?? { status: 500, message: "Generation failed." };
    return NextResponse.json(
      { error: failure.message, reason: result.reason },
      { status: failure.status },
    );
  }

  return NextResponse.json({ graph: result.graph });
}
