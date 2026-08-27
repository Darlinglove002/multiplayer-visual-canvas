import type { NextConfig } from "next";

// A strict Content-Security-Policy is deliberately deferred until the canvas
// and CodeMirror are in place (Phase 1) — setting one now, before we know what
// the editor and React Flow actually need, would just be guesswork. These
// header-level defenses are safe to set today.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // We maintain one hand-written AGENTS.md at the repo root; don't let `next dev`
  // scatter generated AGENTS.md / CLAUDE.md files into apps/web.
  agentRules: false,
  transpilePackages: ["@canvas/shared"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
