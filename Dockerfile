# Stage 1: build client
FROM node:20-alpine AS client-builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY client ./client/
RUN pnpm --filter client build

# Stage 2: server + Playwright (Chromium needs Debian deps)
FROM node:20-bookworm-slim AS server
WORKDIR /app

# Install Playwright Chromium and system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install
COPY server ./server/

# Copy built client into server public
COPY --from=client-builder /app/client/dist ./server/public

# Install Playwright browsers (chromium only)
RUN cd server && npx playwright install chromium

# Build server TypeScript
RUN pnpm --filter server build 2>/dev/null || (cd server && pnpm install && pnpm build)

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Create screenshots dir
RUN mkdir -p server/storage/screenshots

CMD ["node", "server/dist/index.js"]
