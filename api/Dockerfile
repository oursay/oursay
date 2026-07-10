# API image — runs `openapi:dump` then the HTTP service.
# Build context is the monorepo root (see docker-compose.*.yml).
FROM node:22-bookworm-slim

WORKDIR /repo

COPY package.json package-lock.json ./
COPY api ./api
COPY public-record ./public-record
COPY geo ./geo
COPY identity ./identity
COPY jurisdiction-data ./jurisdiction-data
COPY encode ./encode
COPY slugs ./slugs
COPY scripts ./scripts
# Remaining workspaces are listed in the root package.json; stub their package.json so
# `npm ci` can link the workspace graph without copying the whole monorepo.
COPY web-app/package.json ./web-app/
COPY site/package.json ./site/
COPY turnkey-test/package.json ./turnkey-test/
COPY immudb-test/package.json ./immudb-test/
COPY passkey-test/package.json ./passkey-test/

RUN npm ci

WORKDIR /repo
# Default: regenerate the committed OpenAPI snapshot, then serve (production).
# Compose overrides the second half for dev (`npm run dev`).
CMD ["sh", "-c", "npm run openapi:dump -w @oursay/api && npm run start -w @oursay/api"]
