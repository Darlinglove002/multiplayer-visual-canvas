import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  HOCUSPOCUS_PORT: z.coerce.number().int().positive().default(1234),
  // Hocuspocus disconnects a client that hasn't pinged within this window.
  HOCUSPOCUS_TIMEOUT: z.coerce.number().int().positive().default(30_000),
  // Debounce window for persisting a changed document (ms).
  HOCUSPOCUS_DEBOUNCE: z.coerce.number().int().positive().default(2_000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid sync-server environment:\n", z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
