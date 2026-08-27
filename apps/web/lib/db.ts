import { Pool } from "pg";
import { env } from "./env";

// A single pooled connection per server instance, reused across hot reloads in
// dev so we don't exhaust Postgres connections.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ?? new Pool({ connectionString: env.DATABASE_URL, max: 5 });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}
