# @oursay/web-app

The OurSay civic web app (Next.js App Router). Phase D recreates the mobile
wireframe's behaviour and information architecture in full colour and responsive
layout. This package (Phase D1) lands the data foundation: typed domain models, a
faithful port of the wireframe's mock corpus, pure read-model helpers, and a
mock-backed frontend API layer that documents the future `/v1/public/...`
contract. UI components (D2) and the app shell / views (D3) build on top.

## Run

From the repo root:

```bash
npm install
npm run dev -w @oursay/web-app       # http://localhost:3000
npm run build -w @oursay/web-app     # production build
npm run test -w @oursay/web-app      # Vitest (read-model + API unit tests)
npm run typecheck -w @oursay/web-app # tsc --noEmit
```

The marketing site (`@oursay/site`, Astro) runs on its own port, so the two dev
servers don't collide.

The home route (`/`) is a minimal health check: it loads the mock feed through
the API layer and prints the record count, proving the types compile and the
corpus loads. Real views are Phase D3.

## Folder map

```
web-app/
├── src/
│   ├── app/                     Next.js App Router (layout + health route + tokens)
│   └── lib/
│       ├── types/               Domain types (records, comments, jurisdiction,
│       │                        profile, verification, filters, viewer)
│       ├── mock/                Ported wireframe corpus + README field mapping
│       ├── read-model/          Pure helpers: relTime, scaling, geography, matches
│       └── api/                 Mock-backed frontend API + CONTRACT.md
└── ...config
```

- [`src/lib/mock/README.md`](src/lib/mock/README.md) — how each wireframe field
  maps to a domain type / entity, and the synthetic id lookup table.
- [`src/lib/api/CONTRACT.md`](src/lib/api/CONTRACT.md) — per-function mapping to
  the existing OpenAPI, plus a gap analysis with proposed backend endpoints.

## The read model

The wireframe's filter and scaling logic is the contract between API data and the
UI. It lives in `src/lib/read-model/` as pure functions (they take an explicit
`ViewerContext` + `FeedFilterParams` instead of reading a global `state`):

- `relTime(iso, now)` — relative/absolute timestamp label.
- `matches(item, scope, ctx, filter)` — the one list matcher (record-type
  include, Verified ladder, jurisdiction/district scope, My Districts).
- `geographyKeep(...)` — My Districts and Affected composed as an OR; Affected is
  a post-detail comment filter only.
- `scaleSocial` / `civicExtra` — thin social counts; surface the additive
  unverified-civic note.

## Mock → real API swap plan

Every function in `src/lib/api/` is async and returns a typed DTO. Today each
reads the mock corpus; to go live, keep the signature and return type and change
the body to `fetch('/v1/public/...')` + map the response to the DTO.

1. Implement the backend endpoints in
   [`src/lib/api/CONTRACT.md`](src/lib/api/CONTRACT.md) Part 2 (unified feed,
   public profiles, nested comments, edit counts, interlinks).
2. Replace each function body with a `fetch`; keep `matches` / `scaleSocial` /
   `geographyKeep` as the client-side read-model contract.
3. Swap the mock ids for real record ids; route `getRecordDetail(id, kind)` and
   navigation by id (the wireframe's representative-target nav becomes real).

## Scope (Phase D1)

In: types, mock data, read-model helpers, mock-backed API, one health route.
Out: React components (D2), full views/pages (D3), auth / WebAuthn / civic write
paths, and any live API calls.
