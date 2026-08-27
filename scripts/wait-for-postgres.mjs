// Blocks until Postgres accepts a connection, or 60s elapse.
import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/canvas";
const deadline = Date.now() + 60_000;

while (Date.now() < deadline) {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    await client.query("select 1");
    await client.end();
    console.log("  postgres is ready");
    process.exit(0);
  } catch {
    await client.end().catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));
  }
}

console.error("  postgres did not become ready within 60s");
process.exit(1);
