# apps/sync — the Hocuspocus sync server. Deployed as a long-lived process
# (Railway / Fly / Render), NOT to a serverless platform: it holds the live
# Y.Doc for every open board in memory and terminates WebSocket connections.
#
# Build context is the REPO ROOT (npm workspaces). On Railway: set the service
# root to the repo and the Dockerfile path to apps/sync/Dockerfile.
FROM node:22-alpine
WORKDIR /app

# Install against the full lockfile — npm workspaces needs every referenced
# package.json present. (TODO: trim the image with a pruned install later.)
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
COPY apps/sync/package.json ./apps/sync/
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/sync ./apps/sync

ENV NODE_ENV=production
# The host injects the real port as $PORT (Fly → 8080); src/env.ts honours it.
EXPOSE 8080
CMD ["npm", "run", "start", "-w", "@canvas/sync"]
