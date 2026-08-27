// Phase 0 smoke test for the sync server's room gate:
//   - a real board id (created via POST /api/boards) connects and syncs
//   - a random uuid is rejected by onAuthenticate
//
// Run with the dev servers up:  node scripts/smoke-sync.mjs
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const SYNC = process.env.SYNC_URL ?? "ws://localhost:1234";

function connect(boardId, { expect }) {
  return new Promise((resolve) => {
    const provider = new HocuspocusProvider({
      url: SYNC,
      name: boardId,
      document: new Y.Doc(),
      token: "anonymous",
      preserveConnection: false,
      onSynced: () => {
        if (expect === "synced") pass(`synced to ${boardId.slice(0, 8)}…`);
        else fail(`unexpectedly synced to ${boardId.slice(0, 8)}…`);
        cleanup();
      },
      onAuthenticationFailed: ({ reason }) => {
        if (expect === "rejected") pass(`rejected (${reason || "no reason"})`);
        else fail(`unexpectedly rejected: ${reason}`);
        cleanup();
      },
    });
    const timer = setTimeout(() => {
      fail(`timed out waiting to be ${expect}`);
      cleanup();
    }, 8000);

    let done = false;
    function cleanup() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      provider.destroy();
      resolve();
    }
    function pass(msg) {
      console.log(`  PASS  ${msg}`);
    }
    function fail(msg) {
      console.error(`  FAIL  ${msg}`);
      process.exitCode = 1;
    }
  });
}

const res = await fetch(`${WEB}/api/boards`, { method: "POST", body: "{}" });
if (!res.ok) {
  console.error(`could not create a board (${res.status}) — are the dev servers up?`);
  process.exit(1);
}
const { id } = await res.json();
console.log(`created board ${id}`);

console.log("\nvalid board id:");
await connect(id, { expect: "synced" });

console.log("\nrandom (nonexistent) uuid:");
await connect("00000000-0000-4000-8000-000000000000", { expect: "rejected" });

console.log(process.exitCode ? "\nsmoke test FAILED" : "\nsmoke test passed");
process.exit(process.exitCode ?? 0);
