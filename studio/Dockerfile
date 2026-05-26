# Stage 1: Compile rocktools C binaries
FROM debian:bookworm-slim AS builder-c

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc make libpng-dev libc6-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY Makefile structs.h *.c ./
COPY samples/ samples/

RUN make

# Stage 2: Build frontend
FROM node:20-slim AS builder-frontend

WORKDIR /app/client
COPY studio/client/package.json studio/client/package-lock.json* ./
RUN npm install

COPY studio/client/ ./
RUN npm run build

# Stage 3: Build server
FROM node:20-slim AS builder-server

WORKDIR /app/server
COPY studio/server/package.json studio/server/package-lock.json* ./
RUN npm install

COPY studio/server/ ./
RUN npm run build

# Stage 4: Runtime
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpng16-16 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy rocktools binaries
COPY --from=builder-c /build/rockcreate /usr/local/bin/
COPY --from=builder-c /build/rockdetail /usr/local/bin/
COPY --from=builder-c /build/rocksmooth /usr/local/bin/
COPY --from=builder-c /build/rockerode /usr/local/bin/
COPY --from=builder-c /build/rockconvert /usr/local/bin/
COPY --from=builder-c /build/rockinfo /usr/local/bin/
COPY --from=builder-c /build/rocktrim /usr/local/bin/
COPY --from=builder-c /build/rockxray /usr/local/bin/
COPY --from=builder-c /build/rockbalance /usr/local/bin/
COPY --from=builder-c /build/rockpng /usr/local/bin/

# Copy sample meshes
COPY --from=builder-c /build/samples /app/samples

# Copy server
COPY --from=builder-server /app/server/dist /app/server/dist
COPY --from=builder-server /app/server/node_modules /app/server/node_modules
COPY --from=builder-server /app/server/package.json /app/server/

# Copy frontend static files
COPY --from=builder-frontend /app/client/dist /app/public

# Create output directory
RUN mkdir -p /app/output

ENV NODE_ENV=production
ENV PORT=3800
EXPOSE 3800

CMD ["node", "server/dist/index.js"]
