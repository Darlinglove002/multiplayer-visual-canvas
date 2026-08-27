import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "./env";

// Sliding-window limits backed by Redis (Upstash in prod, the docker
// serverless-redis-http shim in local dev). Real shared state — an in-memory
// counter would not limit anything on Vercel, where every request can hit a
// fresh function instance.
const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

/** Board creation: cheap to spam, writes two rows each time. */
export const boardCreateLimit = new Ratelimit({
  redis,
  prefix: "rl:board-create",
  limiter: Ratelimit.slidingWindow(5, "10 m"),
});

/** Board metadata writes (rename). Higher ceiling — it's a single-row update. */
export const boardMutateLimit = new Ratelimit({
  redis,
  prefix: "rl:board-mutate",
  limiter: Ratelimit.slidingWindow(30, "1 m"),
});

/** AI generation: each call costs a real, billed Anthropic request. Tighter. */
export const aiGenerateLimit = new Ratelimit({
  redis,
  prefix: "rl:ai-generate",
  limiter: Ratelimit.slidingWindow(10, "1 h"),
});

export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || "127.0.0.1";
}
