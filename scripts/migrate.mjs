// Applies migrations/*.sql in filename order, once each, tracked in a
// `_migrations` table. Safe to re-run. Used by `npm run setup`, `npm run
// db:migrate`, and CI. Points at DATABASE_URL, or the local docker Postgres.
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationsDir = path.join(root, "migrations");
const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/canvas";

const client = new pg.Client({ connectionString });
await client.connect();

await client.query(`
  create table if not exists _migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
  )
`);

const { rows } = await client.query("select name from _migrations");
const applied = new Set(rows.map((r) => r.name));

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

let ran = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  const sql = await readFile(path.join(migrationsDir, file), "utf8");
  process.stdout.write(`  applying ${file} ... `);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into _migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log("ok");
    ran += 1;
  } catch (err) {
    await client.query("rollback");
    console.log("failed");
    console.error(err);
    await client.end();
    process.exit(1);
  }
}

console.log(ran === 0 ? "  already up to date" : `  applied ${ran} migration(s)`);
await client.end();
