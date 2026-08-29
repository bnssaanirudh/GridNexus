# ==============================================================================
# GridNexus Layer 2: Broker – Multi-Stage Production Dockerfile
# Node.js 20, Express, Socket.IO, BullMQ, Prisma PostgreSQL
# ==============================================================================

# ── Stage 1: Build & Compile TypeScript ───────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma engine compatibility on Alpine
RUN apk add --no-cache openssl

# Copy package manifests
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for tsc)
RUN npm install --legacy-peer-deps

# Copy source code and Prisma schema
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./

# Generate Prisma Client and compile TypeScript
RUN npx prisma generate
RUN npm run build

# Prune development dependencies and ensure Prisma client is generated in production node_modules
RUN npm prune --omit=dev && npx prisma generate

# ── Stage 2: Minimal Production Runtime ────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Install OpenSSL for runtime Prisma client query engine
RUN apk add --no-cache openssl

# Copy compiled artifacts, prisma schema/client, and production node_modules
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma

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
