// Phase 3 headless end-to-end check: two HocuspocusProvider clients on one board,
// driven through the real @canvas/shared doc ops — CRDT sync, concurrent merges,
// awareness, and the headline: a client's undo reverts only its own work.
//   Run with the dev stack up:  node scripts/smoke-multiplayer.mjs
// @canvas/shared is TS source bare `node` can't load; tsx's ESM loader bridges
// it, as apps/sync does. Node 22+ has global WebSocket (no `ws` polyfill).
import { register } from "tsx/esm/api";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";

const unregister = register();
const { LOCAL_ORIGIN, getNodesMap, getEdgesMap, createNode, getNodeContent, nodesForFlow } =
  await import("@canvas/shared");

const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";
const SYNC_URL = process.env.SYNC_URL ?? "ws://localhost:1234";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, timeout = 4000, interval = 100) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(interval);
  }
  return predicate();
}

let failures = 0;
function check(name, ok, detail) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function connect(name, doc) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name}: sync timed out`)), 10000);
    const provider = new HocuspocusProvider({
      url: SYNC_URL,
      name,
      document: doc,
      token: "anonymous",
      preserveConnection: false,
      onSynced: () => {
        clearTimeout(timer);
        resolve(provider);
      },
      onAuthenticationFailed: ({ reason }) => {
        clearTimeout(timer);
        reject(new Error(`${name}: auth failed (${reason})`));
      },
    });
  });
}

async function createBoard() {
  const health = await fetch(`${WEB_URL}/api/health`).catch(() => null);
  if (!health || !health.ok) {
    throw new Error(`health check failed at ${WEB_URL}/api/health — is the dev stack up?`);
  }
  const res = await fetch(`${WEB_URL}/api/boards`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (res.status === 429) {
    const retry = res.headers.get("retry-after") ?? "?";
    throw new Error(
      `POST /api/boards rate-limited (429) — retry in ${retry}s (5 boards / 10min / IP)`,
    );
  }
  if (!res.ok) throw new Error(`POST /api/boards failed (${res.status})`);
  return (await res.json()).id;
}

const nodeIds = (doc) =>
  nodesForFlow(doc)
    .map((n) => n.id)
    .sort();
const has = (doc, nid) => getNodesMap(doc).has(nid);
const node = (kind, x, y) => ({ kind, x, y, content: "" });

async function run() {
  const id = await createBoard();
  console.log(`board ${id}\n`);

  const docA = new Y.Doc();
  const docB = new Y.Doc();
  let providerA = null;
  let providerB = null;
  try {
    [providerA, providerB] = await Promise.all([connect(id, docA), connect(id, docB)]);

    const umOpts = { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 350 };
    const umA = new Y.UndoManager([getNodesMap(docA), getEdgesMap(docA)], umOpts);
    const umB = new Y.UndoManager([getNodesMap(docB), getEdgesMap(docB)], umOpts);

    // 1. Sync propagation, both directions.
    createNode(docA, "nA", node("action", 10, 10), LOCAL_ORIGIN);
    const aToB = await waitFor(() => has(docB, "nA"));
    createNode(docB, "nB", node("action", 20, 20), LOCAL_ORIGIN);
    const bToA = await waitFor(() => has(docA, "nB"));
    check("1 sync propagation", aToB && bToA, `A=[${nodeIds(docA)}] B=[${nodeIds(docB)}]`);

    // 2. Concurrent create in one tick — CRDT union, nothing lost.
    umA.stopCapturing();
    umB.stopCapturing();
    createNode(docA, "cA", node("action", 1, 1), LOCAL_ORIGIN);
    createNode(docB, "cB", node("action", 2, 2), LOCAL_ORIGIN);
    await waitFor(() => has(docA, "cB") && has(docB, "cA"), 3000);
    await sleep(300);
    check(
      "2 concurrent create merge",
      has(docA, "cA") && has(docA, "cB") && has(docB, "cA") && has(docB, "cB"),
      `A=[${nodeIds(docA)}] B=[${nodeIds(docB)}]`,
    );

    // 3. Concurrent text insert on a shared node — no keystrokes dropped.
    const textA = getNodeContent(docA, "nA");
    const textB = getNodeContent(docB, "nA");
    textA?.insert(0, "AAA");
    textB?.insert(0, "BBB");
    await waitFor(
      () => textA?.toString().length === 6 && textA?.toString() === textB?.toString(),
      3000,
    );
    await sleep(300);
    const a = textA?.toString() ?? "";
    const b = textB?.toString() ?? "";
    check(
      "3 concurrent text merge",
      a.length === 6 && a === b && a.includes("AAA") && a.includes("BBB"),
      `A="${a}" B="${b}"`,
    );

    // 4. Multiplayer undo — a client's undo reverts only its own work.
    umA.stopCapturing();
    umB.stopCapturing();
    const stackBefore = umA.undoStack.length;
    createNode(docA, "nA2", node("action", 5, 5), LOCAL_ORIGIN);
    umA.stopCapturing();
    createNode(docB, "nB2", node("action", 6, 6), LOCAL_ORIGIN);
    umB.stopCapturing();
    await waitFor(() => has(docA, "nB2") && has(docB, "nA2"), 3000);
    await sleep(300);
    const pushed = umA.undoStack.length - stackBefore;
    umA.undo();
    await waitFor(() => !has(docB, "nA2"), 3000);
    await sleep(300);
    const ownUndone = !has(docA, "nA2") && !has(docB, "nA2");
    const peerUntouched = has(docA, "nB2") && has(docB, "nB2");
    umB.undo();
    await waitFor(() => !has(docA, "nB2"), 3000);
    await sleep(300);
    const peerCleared = !has(docA, "nB2") && !has(docB, "nB2");
    check(
      "4 multiplayer undo reverts only own work",
      pushed === 1 && ownUndone && peerUntouched && peerCleared,
      `pushed ${pushed} item; umA.undo -> nA2 gone both=${ownUndone}, nB2 safe both=${peerUntouched}; ` +
        `umB.undo -> nB2 gone both=${peerCleared}`,
    );

    // 5. A remote-origin arrival must not grow A's local undo stack.
    umA.stopCapturing();
    const stackBeforeRemote = umA.undoStack.length;
    createNode(docB, "rOnly", node("action", 9, 9), LOCAL_ORIGIN);
    const arrived = await waitFor(() => has(docA, "rOnly"), 3000);
    await sleep(300);
    check(
      "5 remote-origin change stays out of local undo stack",
      arrived && umA.undoStack.length === stackBeforeRemote,
      `stack ${stackBeforeRemote} -> ${umA.undoStack.length}, rOnly reached A=${arrived}`,
    );

    // 6. Awareness propagates, and a disconnect clears it.
    const clientA = providerA.awareness.clientID;
    providerA.setAwarenessField("user", { name: "Alice", color: "#f00" });
    const sawAlice = await waitFor(() => {
      for (const [cid, st] of providerB.awareness.getStates()) {
        if (cid !== providerB.awareness.clientID && st?.user?.name === "Alice") return true;
      }
      return false;
    }, 4000);
    providerA.destroy();
    providerA = null;
    const aliceCleared = await waitFor(
      () => !providerB.awareness.getStates().has(clientA),
      5000,
      250,
    );
    check(
      "6 awareness propagates and clears on disconnect",
      sawAlice && aliceCleared,
      `sawAlice=${sawAlice}, clearedAfterDestroy=${aliceCleared}`,
    );
  } finally {
    providerA?.destroy();
    providerB?.destroy();
    docA.destroy();
    docB.destroy();
  }
}

try {
  await run();
  console.log(failures === 0 ? "\nall 6 checks PASS" : `\n${failures} of 6 checks FAILED`);
} catch (err) {
  console.error(`\nsmoke aborted: ${err.message}`);
  failures = Math.max(failures, 1);
} finally {
  await unregister();
}
process.exitCode = failures === 0 ? 0 : 1;
