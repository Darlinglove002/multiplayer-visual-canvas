import { Pool } from "pg";
import { env } from "./env";

// Local Postgres speaks plain TCP; every hosted one needs TLS, and the
// certificate is always verified. Providers with a public CA (Neon, …) work out
// of the box. Supabase signs with its own CA, which Node doesn't ship — put
// that certificate (PEM text) in DATABASE_CA_CERT. Keep `sslmode` out of
// DATABASE_URL: the driver would let it override this setting.
function sslFor(url: string) {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return undefined;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return undefined;
  return process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT } : true;
}

// A single pooled connection per server instance, reused across hot reloads in
// dev so we don't exhaust Postgres connections.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ??
  new Pool({ connectionString: env.DATABASE_URL, max: 5, ssl: sslFor(env.DATABASE_URL) });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}
