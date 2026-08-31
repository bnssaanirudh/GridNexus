# ==============================================================================
# GridNexus Layer 2: Broker – Multi-Stage Production Dockerfile
# Node.js 20, Express, Socket.IO, BullMQ, Prisma PostgreSQL
# ==============================================================================

# ── Stage 1: Build & Compile TypeScript ───────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma engine compatibility on Alpine
RUN apk add --no-cache openssl

# Copy the workspace lockfile and only the selected workspace manifest first.
COPY package.json package-lock.json ./
COPY broker/package.json ./broker/package.json

# Install exactly the dependency graph committed in package-lock.json.
RUN npm ci --workspace broker --include-workspace-root=false --legacy-peer-deps

# Copy source code and Prisma schema
COPY broker/prisma ./broker/prisma
COPY broker/src ./broker/src
COPY broker/tsconfig.json ./broker/tsconfig.json

WORKDIR /app/broker

# Generate Prisma Client and compile TypeScript
RUN npx prisma generate
RUN npm run build

# Dedicated one-shot image target used by Compose/Kubernetes migration jobs.
FROM builder AS migrator

ENV NODE_ENV=production
CMD ["npx", "--no-install", "prisma", "migrate", "deploy"]

FROM builder AS production-deps
WORKDIR /app
RUN npm prune --omit=dev --workspace broker --include-workspace-root=false && \
    cd broker && npx prisma generate

# ── Stage 2: Minimal Production Runtime ────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Install OpenSSL for runtime Prisma client query engine
RUN apk add --no-cache openssl

# Copy compiled artifacts, prisma schema/client, and production node_modules
COPY --from=production-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=production-deps --chown=node:node /app/broker/package.json ./package.json
COPY --from=production-deps --chown=node:node /app/broker/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/broker/dist ./dist
COPY --from=builder --chown=node:node /app/broker/prisma ./prisma

# Environment variables
ENV NODE_ENV=production \
    PORT=3000

# Run as non-root node user (UID 1000)
USER node

# Healthcheck
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "const http = require('http'); const req = http.get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)); req.on('error', () => process.exit(1));"

EXPOSE 3000

CMD ["node", "dist/index.js"]
