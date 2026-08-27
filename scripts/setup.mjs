// One-command local bootstrap:
//   1. bring up infra (Postgres + Redis + Upstash-compatible HTTP shim) via docker compose
//   2. wait for Postgres, apply migrations
//   3. write apps/web/.env.local and apps/sync/.env, preserving an existing ANTHROPIC_API_KEY
//
// CI runs the same migrate step against its own Postgres, so the documented
// setup path and CI can't silently drift apart.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const run = (cmd, env) => execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });

// Local dev values only. Production points at Neon + real Upstash + a deployed
// sync server via each host's own env vars.
const DATABASE_URL = "postgres://postgres:postgres@localhost:5433/canvas";
const SYNC_PORT = "1234";
const SRH_URL = "http://localhost:8079";
const SRH_TOKEN = "local_dev_token";

console.log("1/3  Starting infra  (docker compose up -d)");
try {
  run("docker compose up -d");
} catch {
  console.error("\ndocker compose failed — is Docker Desktop running?");
  process.exit(1);
}

console.log("\n2/3  Postgres + migrations");
run("node scripts/wait-for-postgres.mjs", { DATABASE_URL });
run("node scripts/migrate.mjs", { DATABASE_URL });

console.log("\n3/3  Env files");

function existingValue(file, key) {
  if (!existsSync(file)) return "";
  const m = readFileSync(file, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
  return m && m[1].trim() ? m[1].trim() : "";
}

const webEnvPath = path.join(root, "apps", "web", ".env.local");
const syncEnvPath = path.join(root, "apps", "sync", ".env");

const anthropicKey =
  existingValue(webEnvPath, "ANTHROPIC_API_KEY") || process.env.ANTHROPIC_API_KEY || "";

mkdirSync(path.dirname(webEnvPath), { recursive: true });
writeFileSync(
  webEnvPath,
  [
    "# Written by scripts/setup.mjs — local dev. Re-run `npm run setup` to refresh.",
    `DATABASE_URL=${DATABASE_URL}`,
    `NEXT_PUBLIC_SYNC_URL=ws://localhost:${SYNC_PORT}`,
    `UPSTASH_REDIS_REST_URL=${SRH_URL}`,
    `UPSTASH_REDIS_REST_TOKEN=${SRH_TOKEN}`,
    "# Not automatable — get one from https://console.anthropic.com",
    `ANTHROPIC_API_KEY=${anthropicKey}`,
    "",
  ].join("\n"),
);

mkdirSync(path.dirname(syncEnvPath), { recursive: true });
writeFileSync(
  syncEnvPath,
  [
    "# Written by scripts/setup.mjs — local dev.",
    `DATABASE_URL=${DATABASE_URL}`,
    `HOCUSPOCUS_PORT=${SYNC_PORT}`,
    "NODE_ENV=development",
    "",
  ].join("\n"),
);

console.log(
  [
    "",
    "Done.",
    `  apps/web/.env.local   ${anthropicKey ? "(ANTHROPIC_API_KEY carried over)" : "(add ANTHROPIC_API_KEY before Phase 5)"}`,
    "  apps/sync/.env",
    "",
    `Next:  npm run dev     web -> http://localhost:3000   sync -> ws://localhost:${SYNC_PORT}`,
    "",
  ].join("\n"),
);
