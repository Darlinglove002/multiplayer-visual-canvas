import pg from "pg";
import { env } from "./env";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
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
