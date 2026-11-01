import { createHash } from "node:crypto";
import { pool } from "./db";

// Fixed-window limits backed by Postgres (migrations/0002_rate_limits.sql).
// Real shared state — an in-memory counter would not limit anything on Vercel,
// where every request can hit a fresh function instance.

export interface Limiter {
  limit(identifier: string): Promise<{ success: boolean; reset: number }>;
}

function intFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// Only a hash of the visitor id is stored, never the raw address.
function hashed(identifier: string): string {
  return createHash("sha256")
    .update(`${process.env.RATE_LIMIT_SALT ?? ""}|${identifier}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * `failOpen: true` lets the request through if the limiter itself errors —
 * right for cheap writes. Anything that spends money leaves it false, so a
 * limiter failure refuses the call instead of uncapping the bill.
 */
function makeLimit(name: string, max: number, windowSeconds: number, failOpen: boolean): Limiter {
  return {
    async limit(identifier: string) {
      try {
        const { rows } = await pool.query<{ out_allowed: boolean; out_retry_after: number }>(
          "select * from consume_rate_limit($1, $2, $3)",
          [`${name}:${hashed(identifier)}`, windowSeconds, max],
        );
        const row = rows[0];
        if (!row) throw new Error("rate limit check returned no row");
        return { success: row.out_allowed, reset: Date.now() + row.out_retry_after * 1000 };
      } catch (err) {
        console.error(`rate limiter "${name}" failed:`, err);
        if (failOpen) return { success: true, reset: Date.now() };
        throw err;
      }
    },
  };
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Board creation: cheap to spam, writes two rows each time. */
export const boardCreateLimit = makeLimit("board-create", 5, 10 * MINUTE, true);

/** Board metadata writes (rename). Higher ceiling — it's a single-row update. */
export const boardMutateLimit = makeLimit("board-mutate", 30, MINUTE, true);

/** AI generation per visitor: each call is a real, billed Anthropic request. */
export const aiGenerateLimit = makeLimit("ai-generate", intFromEnv("AI_PER_IP_PER_HOUR", 10), HOUR, false);

/** AI generation across ALL visitors — the cap that actually bounds the bill. */
export const aiDailyBudget = makeLimit("ai-budget-day", intFromEnv("DAILY_AI_CALL_CAP", 25), DAY, false);
export const aiMonthlyBudget = makeLimit("ai-budget-30d", intFromEnv("MONTHLY_AI_CALL_CAP", 200), 30 * DAY, false);

export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || "127.0.0.1";
}
