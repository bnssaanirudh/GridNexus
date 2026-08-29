# ==============================================================================
# GridNexus Layer 3: Command Center – Multi-Stage Production Dockerfile
# React 18, Vite, TypeScript, Nginx Alpine Runtime
# ==============================================================================

# ── Stage 1: Build Static Web Application ─────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code and build configs
COPY . .

# Build production bundle to /app/dist
RUN npm run build

# ── Stage 2: Minimal Production Nginx Runtime ─────────────────────────────────
FROM nginx:1.27-alpine-slim AS runtime

# Copy custom Nginx server block
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

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
