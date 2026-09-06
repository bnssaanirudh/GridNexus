# ==============================================================================
# GridNexus Layer 3: Command Center – Multi-Stage Production Dockerfile
# React 18, Vite, TypeScript, Nginx Alpine Runtime
# ==============================================================================

# ── Stage 1: Build Static Web Application ─────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy the monorepo lockfile and selected workspace manifest.
COPY package.json package-lock.json ./
COPY command-center/package.json ./command-center/package.json

# Install exactly the committed dependency graph.
RUN npm ci --workspace command-center --include-workspace-root=false --legacy-peer-deps

# Copy source code and build configs without the rest of the monorepo.
COPY command-center ./command-center

WORKDIR /app/command-center

# Vite values are compiled into the static bundle. Production defaults use the
# Nginx same-origin proxy instead of unreachable browser-local service ports.
ARG VITE_BROKER_URL=""
ARG VITE_ENGINE_URL="/engine"
ARG VITE_API_URL="/engine"
ARG VITE_GRIDNEXUS_MODE="production"
ARG VITE_DEMO_MODE="false"
ENV VITE_BROKER_URL=${VITE_BROKER_URL} \
    VITE_ENGINE_URL=${VITE_ENGINE_URL} \
    VITE_API_URL=${VITE_API_URL} \
    VITE_GRIDNEXUS_MODE=${VITE_GRIDNEXUS_MODE} \
    VITE_DEMO_MODE=${VITE_DEMO_MODE}

# Build production bundle to /app/dist
RUN npm run build

# ── Stage 2: Minimal Production Nginx Runtime ─────────────────────────────────
FROM nginx:1.27-alpine-slim AS runtime

# Copy custom Nginx server block
COPY command-center/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder
COPY --from=builder /app/command-center/dist /usr/share/nginx/html

# Configure unprivileged execution directories
RUN touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /usr/share/nginx/html /etc/nginx/conf.d /var/log/nginx

# Run as non-root nginx user
USER nginx

# Healthcheck on /healthz
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:5173/healthz || exit 1

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
