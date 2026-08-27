// Phase 4 check: the sync server projects the live Y.Doc into
// board_documents.snapshot (jsonb) on every debounced store, and bumps
// boards.last_activity_at. Drives a real HocuspocusProvider + @canvas/shared
// ops, then reads Postgres directly and compares.
//   Run with the dev stack up:  node scripts/smoke-snapshot.mjs
import { register } from "tsx/esm/api";
import * as Y from "yjs";
import pg from "pg";
import { HocuspocusProvider } from "@hocuspocus/provider";

const unregister = register();
const { LOCAL_ORIGIN, createNode, createEdge, getNodeContent, snapshotFromDoc, canvasSnapshotSchema } =
  await import("@canvas/shared");

const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";
const SYNC_URL = process.env.SYNC_URL ?? "ws://localhost:1234";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/canvas";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, ok, detail) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function createBoard() {
  const health = await fetch(`${WEB_URL}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`dev stack not reachable at ${WEB_URL}`);
  const res = await fetch(`${WEB_URL}/api/boards`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (res.status === 429) throw new Error("POST /api/boards rate-limited (5 / 10min / IP)");
  if (!res.ok) throw new Error(`POST /api/boards failed (${res.status})`);
  return (await res.json()).id;
}

async function run() {
  const id = await createBoard();
  console.log(`board ${id}\n`);

  const doc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: SYNC_URL,
    name: id,
    document: doc,
    token: "anonymous",
    preserveConnection: false,
  });
  const pgClient = new pg.Client({ connectionString: DATABASE_URL });

  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("sync timed out")), 10000);
      provider.on("synced", () => {
        clearTimeout(t);
        resolve();
      });
    });
    await pgClient.connect();

    const { rows: before } = await pgClient.query(
      "select last_activity_at from boards where id = $1",
      [id],
    );
    const activityBefore = new Date(before[0].last_activity_at).getTime();

    // Build a small graph the way the app does.
    createNode(doc, "s", { kind: "start", x: 0, y: 0, content: "Получить заявку" }, LOCAL_ORIGIN);
    createNode(doc, "a", { kind: "action", x: 0, y: 120, content: "Проверить срок" }, LOCAL_ORIGIN);
    createNode(doc, "d", { kind: "decision", x: 0, y: 240, content: "В окне 14 дней?" }, LOCAL_ORIGIN);
    createNode(doc, "e", { kind: "end", x: 0, y: 360, content: "Вернуть платёж" }, LOCAL_ORIGIN);
    createEdge(doc, "e1", { source: "s", target: "a" }, LOCAL_ORIGIN);
    createEdge(doc, "e2", { source: "a", target: "d" }, LOCAL_ORIGIN);
    createEdge(doc, "e3", { source: "d", target: "e", label: "yes" }, LOCAL_ORIGIN);
    getNodeContent(doc, "a")?.insert(getNodeContent(doc, "a").length, " (last_active_at)");

    const local = snapshotFromDoc(doc);

    // Wait past the sync server's store debounce (2s) with margin.
    await sleep(4500);

    const { rows } = await pgClient.query(
      "select bd.snapshot, b.last_activity_at from board_documents bd join boards b on b.id = bd.board_id where bd.board_id = $1",
      [id],
    );
    const stored = rows[0]?.snapshot;
    const activityAfter = new Date(rows[0]?.last_activity_at ?? 0).getTime();

    const parsed = canvasSnapshotSchema.safeParse(stored);
    check("1 stored snapshot is a valid CanvasSnapshot", parsed.success, parsed.success ? "" : JSON.stringify(parsed.error?.issues?.[0]));

    // Postgres jsonb doesn't preserve key order, so compare canonically:
    // sort rows by id and sort object keys before stringifying.
    const canon = (v) =>
      JSON.stringify(v, (_k, val) =>
        val && typeof val === "object" && !Array.isArray(val)
          ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
          : val,
      );
    const byId = (arr) => [...(arr ?? [])].sort((x, y) => x.id.localeCompare(y.id));
    const same =
      canon({ n: byId(stored?.nodes), e: byId(stored?.edges) }) ===
      canon({ n: byId(local.nodes), e: byId(local.edges) });
    check(
      "2 stored snapshot deep-equals snapshotFromDoc(local)",
      same,
      same ? "" : `stored=${JSON.stringify(stored)} local=${JSON.stringify(local)}`,
    );

    check(
      "3 non-ASCII content survives the round-trip",
      stored?.nodes?.find((n) => n.id === "s")?.content === "Получить заявку" &&
        stored?.nodes?.find((n) => n.id === "a")?.content === "Проверить срок (last_active_at)",
      JSON.stringify(stored?.nodes?.map((n) => n.content)),
    );

    check(
      "4 edge label projected",
      stored?.edges?.find((e) => e.id === "e3")?.label === "yes",
      JSON.stringify(stored?.edges),
    );

    check(
      "5 boards.last_activity_at bumped by the store",
      activityAfter > activityBefore,
      `${activityBefore} -> ${activityAfter}`,
    );
  } finally {
    provider.destroy();
    doc.destroy();
    await pgClient.end().catch(() => {});
  }
}

try {
  await run();
  console.log(failures === 0 ? "\nall 5 checks PASS" : `\n${failures} of 5 checks FAILED`);
} catch (err) {
  console.error(`\nsmoke aborted: ${err.message}`);
  failures = Math.max(failures, 1);
} finally {
  await Promise.race([unregister(), sleep(2000)]).catch(() => {});
  await sleep(200);
}
process.exit(failures === 0 ? 0 : 1);
