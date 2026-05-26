# Headless GLB exporter: rocktools studio + Puppeteer + Chromium (SwiftShader).
#
# Build (from rocktools repo root):
#   docker build -f studio/cli/Dockerfile -t rocktools-export .
#
# Run:
#   docker run --rm -v $(pwd)/output:/output rocktools-export \
#     --config '{"sourceType":"create","baseMesh":"icosahedron0.obj","createParams":{},"steps":[...]}' \
#     --output /output/asteroid.glb --resolution 1024

# ── Stage 1: Build studio client with base="/" ───────────────────────
FROM node:20-slim AS builder

WORKDIR /app/client
COPY studio/client/package.json studio/client/package-lock.json* ./
RUN npm install

COPY studio/client/ ./
ENV ROCKTOOLS_BASE=/
RUN npm run build

# ── Stage 2: Runtime with Chromium ────────────────────────────────────
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy built studio
COPY --from=builder /app/client/dist /app/studio-dist

# Install CLI deps (tsx + puppeteer-core)
COPY studio/cli/package.json /app/cli/
WORKDIR /app/cli
RUN npm install && npm install puppeteer

# Copy CLI script
COPY studio/cli/export-glb.ts /app/cli/

WORKDIR /app/cli
ENTRYPOINT ["npx", "tsx", "export-glb.ts", "--static-dir", "/app/studio-dist"]
