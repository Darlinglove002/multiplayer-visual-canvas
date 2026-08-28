import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// The browser opens a WebSocket straight to the Hocuspocus server, which is a
// different origin in production — CSP has to allow it explicitly.
function syncConnectSrc(): string {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SYNC_URL ?? "");
    const httpProto = u.protocol === "wss:" ? "https:" : "http:";
    return `${u.protocol}//${u.host} ${httpProto}//${u.host}`;
  } catch {
    return "";
  }
}

// Production only: Next's dev server (HMR, React DevTools' eval) needs looser
// rules that carry no security value in prod, since nothing dev-only ships.
// - `'unsafe-inline'` on script/style is a real compromise: the App Router
//   injects inline hydration scripts and a nonce-based CSP needs middleware
//   this repo doesn't have.
// - `worker-src blob:` is required by elkjs (`elk.bundled.js` spawns its layout
//   worker from a blob URL).
// - `connect-src` covers this app's API routes plus the sync WebSocket origin;
//   Anthropic is only ever called server-side, so it's not listed.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  `connect-src 'self' ${syncConnectSrc()}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  agentRules: false,
  // @canvas/shared ships TS source; y-codemirror.next ships untranspiled ESM.
  transpilePackages: ["@canvas/shared", "y-codemirror.next"],
  async headers() {
    const headers = [...securityHeaders];
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Content-Security-Policy", value: contentSecurityPolicy });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
