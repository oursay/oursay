# Civic web-app (Next.js) — production `next start`.
# Build context is the monorepo root (see docker-compose.prod.yml).
#
# NEXT_PUBLIC_* must be passed as build-args (Next inlines them at `next build`).
# Runtime `environment:` alone will NOT enable donation modals / demo banner.
FROM node:22-bookworm-slim AS build

WORKDIR /repo

COPY package.json package-lock.json ./
COPY web-app ./web-app
COPY encode ./encode
COPY identity ./identity
COPY public-record ./public-record
COPY slugs ./slugs
COPY content-limits ./content-limits
COPY geo ./geo
COPY scripts ./scripts
# Remaining workspaces are listed in the root package.json; stub their package.json so
# `npm ci` can link the workspace graph without copying the whole monorepo.
COPY api/package.json ./api/
COPY site/package.json ./site/
COPY jurisdiction-data/package.json ./jurisdiction-data/
COPY evm-anchor/package.json ./evm-anchor/

RUN npm ci

ARG NEXT_PUBLIC_MOCK_ONLY=0
ARG OURSAY_API_URL=http://api:8080
ARG NEXT_PUBLIC_SHOW_DEMO_BANNER=false
# Unset by default — do not assume github/Sponsors when env is missing.
ARG NEXT_PUBLIC_DONATION_MODAL_PROVIDER=
ARG NEXT_PUBLIC_GITHUB_SPONSORS_URL=
ARG NEXT_PUBLIC_ETRANSFER_EMAIL=
ARG NEXT_PUBLIC_SHOW_DONATION_MODAL_PUBLIC=false
ARG NEXT_PUBLIC_SHOW_DONATION_MODAL_KYC=false
ARG NEXT_PUBLIC_SHOW_DONATION_BANNER=false

ENV NEXT_PUBLIC_MOCK_ONLY=$NEXT_PUBLIC_MOCK_ONLY
ENV OURSAY_API_URL=$OURSAY_API_URL
ENV NEXT_PUBLIC_SHOW_DEMO_BANNER=$NEXT_PUBLIC_SHOW_DEMO_BANNER
ENV NEXT_PUBLIC_DONATION_MODAL_PROVIDER=$NEXT_PUBLIC_DONATION_MODAL_PROVIDER
ENV NEXT_PUBLIC_GITHUB_SPONSORS_URL=$NEXT_PUBLIC_GITHUB_SPONSORS_URL
ENV NEXT_PUBLIC_ETRANSFER_EMAIL=$NEXT_PUBLIC_ETRANSFER_EMAIL
ENV NEXT_PUBLIC_SHOW_DONATION_MODAL_PUBLIC=$NEXT_PUBLIC_SHOW_DONATION_MODAL_PUBLIC
ENV NEXT_PUBLIC_SHOW_DONATION_MODAL_KYC=$NEXT_PUBLIC_SHOW_DONATION_MODAL_KYC
ENV NEXT_PUBLIC_SHOW_DONATION_BANNER=$NEXT_PUBLIC_SHOW_DONATION_BANNER

RUN npm run build -w @oursay/web-app

FROM node:22-bookworm-slim AS runner

WORKDIR /repo

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Keep URLs available for any server-side reads; client flags were baked above.
ENV NEXT_PUBLIC_MOCK_ONLY=0
ENV OURSAY_API_URL=http://api:8080

COPY --from=build /repo /repo

WORKDIR /repo
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --retries=12 --start-period=45s \
  CMD node -e "fetch('http://127.0.0.1:3000/').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start", "-w", "@oursay/web-app"]
