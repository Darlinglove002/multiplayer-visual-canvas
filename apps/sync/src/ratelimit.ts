// In-memory sliding-window limiter, keyed by client IP, on connection attempts.
//
// In-memory is the CORRECT choice here precisely because the sync server is a
// single long-lived process — every WebSocket for a given board is terminated
// by this one instance. That is the opposite of a Vercel serverless function,
// where an in-process counter silently fails to limit anything because there is
// no shared memory across invocations. (Scaling this to >1 sync instance would
// need Redis pub/sub — see README "Known limitations".)

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 30;

const attempts = new Map<string, number[]>();

export function allowConnection(ip: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length <= MAX_ATTEMPTS_PER_WINDOW;
}

// Keep the map from growing without bound.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of attempts) {
    const recent = times.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) attempts.delete(ip);
    else attempts.set(ip, recent);
  }
}, WINDOW_MS);
sweep.unref();
