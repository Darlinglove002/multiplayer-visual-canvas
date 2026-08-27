import type { IncomingMessage } from "node:http";
import { Server } from "@hocuspocus/server";
import { Logger } from "@hocuspocus/extension-logger";
import { Database } from "@hocuspocus/extension-database";
import * as Y from "yjs";
import { snapshotFromDoc } from "@canvas/shared";
import { pool, boardExists } from "./db";
import { env } from "./env";
import { allowConnection } from "./ratelimit";

function clientIp(request: IncomingMessage): string {
  const xff = request.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0]!.trim();
  return request.socket.remoteAddress ?? "unknown";
}

Server.configure({
  port: env.HOCUSPOCUS_PORT,
  timeout: env.HOCUSPOCUS_TIMEOUT,
  debounce: env.HOCUSPOCUS_DEBOUNCE,

  async onConnect({ request }) {
    if (!allowConnection(clientIp(request))) {
      throw new Error("rate_limited");
    }
  },

  // `documentName` === board id (uuid). No user accounts yet — the only gate is
  // that the board already exists. Boards can only be created via the web app's
  // rate-limited POST /api/boards, so this is what stops arbitrary clients from
  // spawning junk rooms in memory and in the DB.
  async onAuthenticate({ documentName }) {
    if (!(await boardExists(documentName))) {
      throw new Error("unknown_board");
    }
    return { role: "editor" };
  },

  extensions: [
    new Logger(),
    new Database({
      fetch: async ({ documentName }) => {
        const { rows } = await pool.query<{ ydoc: Buffer | null }>(
          "select ydoc from board_documents where board_id = $1",
          [documentName],
        );
        return rows[0]?.ydoc ?? null;
      },

      // Debounced by the server `debounce` option. We rebuild a throwaway Y.Doc
      // from the update rather than reaching into the live document, then persist
      // both the CRDT blob and a fresh JSON projection in one transaction, and
      // bump last_activity_at for the future TTL cleanup.
      store: async ({ documentName, state }) => {
        const doc = new Y.Doc();
        try {
          Y.applyUpdate(doc, state);
          const snapshot = snapshotFromDoc(doc);
          const client = await pool.connect();
          try {
            await client.query("begin");
            await client.query(
              `insert into board_documents (board_id, ydoc, snapshot, updated_at)
                 values ($1, $2, $3::jsonb, now())
               on conflict (board_id) do update
                 set ydoc = excluded.ydoc,
                     snapshot = excluded.snapshot,
                     updated_at = now()`,
              [documentName, Buffer.from(state), JSON.stringify(snapshot)],
            );
            await client.query("update boards set last_activity_at = now() where id = $1", [
              documentName,
            ]);
            await client.query("commit");
          } catch (err) {
            await client.query("rollback");
            throw err;
          } finally {
            client.release();
          }
        } finally {
          doc.destroy();
        }
      },
    }),
  ],
})
  .listen()
  .then(() => console.log(`[sync] hocuspocus listening on :${env.HOCUSPOCUS_PORT}`))
  .catch((err: unknown) => {
    console.error("[sync] failed to start", err);
    process.exit(1);
  });
