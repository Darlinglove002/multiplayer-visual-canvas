import { z } from "zod";

// An unset env var and one set to "" should both read as "absent".
const optional = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.string().min(1).optional(),
);

// Runtime-validated server environment. A missing or malformed var fails loudly
// at startup instead of surfacing as a confusing error deep in a request.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SYNC_URL: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  // Only required once the AI layer lands (Phase 5).
  ANTHROPIC_API_KEY: optional,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    `Invalid web environment:\n${JSON.stringify(z.treeifyError(parsed.error), null, 2)}`,
  );
}

export const env = parsed.data;
