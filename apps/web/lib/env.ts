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
  // Without it the AI prompt bar answers "not set up" instead of failing.
  ANTHROPIC_API_KEY: optional,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    `Invalid web environment:\n${JSON.stringify(z.treeifyError(parsed.error), null, 2)}`,
  );
}

export const env = parsed.data;
