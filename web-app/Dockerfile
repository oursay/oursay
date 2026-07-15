# Civic web-app (Next.js) — production `next start`.
# Build context is the monorepo root (see docker-compose.prod.yml).
FROM node:22-bookworm-slim AS build

WORKDIR /repo

COPY package.json package-lock.json ./
COPY web-app ./web-app
COPY encode ./encode
COPY identity ./identity
COPY public-record ./public-record
COPY slugs ./slugs
COPY geo ./geo
COPY scripts ./scripts
# Remaining workspaces are listed in the root package.json; stub their package.json so
# `npm ci` can link the workspace graph without copying the whole monorepo.
COPY api/package.json ./api/
COPY site/package.json ./site/
COPY jurisdiction-data/package.json ./jurisdiction-data/
COPY evm-anchor/package.json ./evm-anchor/

RUN npm ci

# Live mode against the compose-network API (rewrites baked at build time).
ENV NEXT_PUBLIC_MOCK_ONLY=0
ENV OURSAY_API_URL=http://api:8080

RUN npm run build -w @oursay/web-app

FROM node:22-bookworm-slim AS runner

WORKDIR /repo

ENV NODE_ENV=production
ENV NEXT_PUBLIC_MOCK_ONLY=0
ENV OURSAY_API_URL=http://api:8080
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /repo /repo

WORKDIR /repo
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --retries=12 --start-period=45s \
  CMD node -e "fetch('http://127.0.0.1:3000/').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start", "-w", "@oursay/web-app"]
