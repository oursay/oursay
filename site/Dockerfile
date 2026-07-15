# Marketing site (Astro) — static build served by nginx.
# Build context is the monorepo root (see docker-compose.prod.yml).
FROM node:22-bookworm-slim AS build

WORKDIR /repo

COPY package.json package-lock.json ./
COPY site ./site
# Remaining workspaces are listed in the root package.json; stub their package.json so
# `npm ci` can link the workspace graph without copying the whole monorepo.
COPY api/package.json ./api/
COPY public-record/package.json ./public-record/
COPY geo/package.json ./geo/
COPY identity/package.json ./identity/
COPY jurisdiction-data/package.json ./jurisdiction-data/
COPY encode/package.json ./encode/
COPY slugs/package.json ./slugs/
COPY web-app/package.json ./web-app/
COPY evm-anchor/package.json ./evm-anchor/

RUN npm ci
RUN npm run build -w @oursay/site

FROM nginx:1.27-alpine

COPY site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/site/dist /usr/share/nginx/html

HEALTHCHECK --interval=10s --timeout=3s --retries=5 --start-period=5s \
  CMD wget -qO- http://127.0.0.1:80/healthz >/dev/null || exit 1

EXPOSE 80
