import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { pool } from "@/lib/db";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase 0 smoke check: are Postgres and the Redis/ratelimit backend reachable?
export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};

  try {
    await pool.query("select 1");
    checks.db = "ok";
  } catch {
    checks.db = "error";
  }

  try {
    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    await redis.set("health:probe", String(Date.now()), { ex: 30 });
    checks.redis = (await redis.get("health:probe")) ? "ok" : "error";
  } catch {
    checks.redis = "error";
  }

  const ok = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
