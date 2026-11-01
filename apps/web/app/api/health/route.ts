import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Smoke check: is Postgres reachable, and has the rate-limit migration run?
export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};

  try {
    await pool.query("select 1");
    checks.db = "ok";
  } catch {
    checks.db = "error";
  }

  try {
    await pool.query("select 1 from rate_limits limit 1");
    checks.rate_limits = "ok";
  } catch {
    checks.rate_limits = "error";
  }

  const ok = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
