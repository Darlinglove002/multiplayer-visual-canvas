import pg from "pg";
import { env } from "./env";

// Local Postgres speaks plain TCP; every hosted one needs TLS, and the
// certificate is always verified. Providers with a public CA work out of the
// box; Supabase signs with its own CA, so put that certificate (PEM text) in
// DATABASE_CA_CERT. Keep `sslmode` out of DATABASE_URL: the driver would let it
// override this setting.
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

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  ssl: sslFor(env.DATABASE_URL),
});

pool.on("error", (err) => {
  console.error("[db] idle client error", err);
});

/** True if the board exists — the only gate on connecting (no accounts yet). */
export async function boardExists(boardId: string): Promise<boolean> {
  // Guard against non-uuid document names before hitting the DB.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(boardId)) {
    return false;
  }
  const { rows } = await pool.query("select 1 from boards where id = $1", [boardId]);
  return rows.length > 0;
}
