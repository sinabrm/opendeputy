# syntax=docker/dockerfile:1
FROM oven/bun:1.3.14 AS base
WORKDIR /app

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY bun-patches ./bun-patches
COPY packages/ui/package.json ./packages/ui/
COPY packages/web/package.json ./packages/web/
COPY packages/electron/package.json ./packages/electron/
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS builder
WORKDIR /app
COPY . .
RUN bun scripts/generate-third-party-licenses.mjs \
  --target=docker-linux-x64 \
  --output=THIRD_PARTY_LICENSES.docker-linux-x64.txt
RUN bun run build:web

FROM node:22-bookworm-slim AS node-runtime

FROM oven/bun:1.3.14 AS runtime
WORKDIR /home/openchamber

# Playwright's persistent Chromium transport runs under the supported Node
# runtime. Bun remains available for dependency management and OpenDeputy builds.
COPY --from=node-runtime /usr/local /usr/local

RUN apt-get update && apt-get install -y --no-install-recommends \
  bash \
  ca-certificates \
  chromium \
  chromium-sandbox \
  fonts-liberation \
  fonts-noto-color-emoji \
  git \
  less \
  openssh-client \
  python3 \
  && rm -rf /var/lib/apt/lists/*

# Replace the base image's 'bun' user (UID 1000) with 'openchamber'
# so mounted volumes with 1000:1000 ownership work correctly.
RUN userdel bun \
  && groupadd -g 1000 openchamber \
  && useradd -u 1000 -g 1000 -m -s /bin/bash openchamber \
  && chown -R openchamber:openchamber /home/openchamber

# Switch to openchamber user
USER openchamber

ENV NPM_CONFIG_PREFIX=/home/openchamber/.npm-global
ENV PATH=${NPM_CONFIG_PREFIX}/bin:${PATH}

# Keep the managed CLI aligned with the pinned @opencode-ai/sdk version.
RUN npm config set prefix /home/openchamber/.npm-global && mkdir -p /home/openchamber/.npm-global && \
  mkdir -p /home/openchamber/.local /home/openchamber/.config /home/openchamber/.ssh /home/openchamber/workspaces && \
  npm install -g opencode-ai@1.18.18

# cloudflared 2026.3.0 - update digest explicitly when upgrading
COPY --from=cloudflare/cloudflared@sha256:6d91c121b803126f7a5344005d17a9324788fc09d305b6e2560ec6040a7ae283 /usr/local/bin/cloudflared /usr/local/bin/cloudflared

ENV NODE_ENV=production
ENV OPENDEPUTY_HEADLESS_BROWSER=true
ENV OPENDEPUTY_BROWSER_EXECUTABLE=/usr/bin/chromium
ENV OPENDEPUTY_WORKSPACE_ROOT=/home/openchamber/workspaces

COPY scripts/docker-entrypoint.sh /home/openchamber/openchamber-entrypoint.sh

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/web/package.json ./packages/web/package.json
COPY --from=builder /app/packages/web/bin ./packages/web/bin
COPY --from=builder /app/packages/web/server ./packages/web/server
COPY --from=builder /app/packages/web/dist ./packages/web/dist

# Artifact-specific legal materials. The generated Docker inventory deliberately
# excludes Electron/Windows-only packages and is produced from Linux dependencies.
COPY --from=builder /app/LICENSE /usr/share/licenses/opendeputy/LICENSE
COPY --from=builder /app/THIRD_PARTY_NOTICES.md /usr/share/licenses/opendeputy/THIRD_PARTY_NOTICES.md
COPY --from=builder /app/THIRD_PARTY_LICENSES.docker-linux-x64.txt /usr/share/licenses/opendeputy/THIRD_PARTY_LICENSES.docker-linux-x64.txt
COPY --from=builder /app/docs/OPEN_SOURCE_COMPONENTS.md /usr/share/licenses/opendeputy/OPEN_SOURCE_COMPONENTS.md
COPY --from=builder /app/legal/third-party /usr/share/licenses/opendeputy/third-party

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["sh", "/home/openchamber/openchamber-entrypoint.sh"]
