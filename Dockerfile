# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-slim AS build

WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY web/package.json web/
COPY shared/package.json shared/

RUN npm ci --ignore-scripts

COPY shared/ shared/
COPY web/ web/
RUN npm run build --workspace=web

COPY server/ server/

# Rebuild better-sqlite3 for the container arch
RUN cd server && npx node-gyp rebuild --release -C node_modules/better-sqlite3 2>/dev/null || \
    npm rebuild better-sqlite3

# ── Production stage ─────────────────────────────────────────────────────────
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# Copy workspace structure
COPY package.json ./
COPY shared/package.json shared/
COPY server/package.json server/

# Copy built artifacts
COPY --from=build /app/shared/ shared/
COPY --from=build /app/server/ server/
COPY --from=build /app/web/dist/ web/dist/
COPY --from=build /app/node_modules/ node_modules/

# Data + backup volumes
RUN mkdir -p /app/data /app/backups
VOLUME ["/app/data", "/app/backups"]

# Copy backup script
COPY scripts/backup.sh /app/scripts/backup.sh
RUN chmod +x /app/scripts/backup.sh 2>/dev/null || true

EXPOSE 8321

CMD ["node", "server/src/index.js"]
