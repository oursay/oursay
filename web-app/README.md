# @oursay/web-app

The OurSay civic web app (Next.js App Router). Phase D recreates the mobile
wireframe's behaviour and information architecture in full colour and responsive
layout, in three layers:

- **D1 — data foundation:** typed domain models, a faithful port of the
  wireframe's mock corpus, pure read-model helpers, and a mock-backed frontend
  API layer that documents the future `/v1/public/...` contract.
- **D2 — components:** presentational UI components (browse the gallery at
  [`/components`](src/app/components/page.tsx)).
- **D3 — app shell + views:** the five routed views, shared chrome, client
  state, and stubbed civic interactions that assemble D1 and D2 into the running
  app.

## Run

From the repo root:

```bash
npm install
npm run dev -w @oursay/web-app       # http://localhost:3000 (mock corpus; no backend)
npm run up  -w @oursay/web-app       # full live stack: API compose + Next (MOCK_ONLY=0)
npm run down -w @oursay/web-app      # tear down API/DB compose volumes
npm run build -w @oursay/web-app     # production build
npm run test -w @oursay/web-app      # Vitest (read-model + API unit tests)
npm run typecheck -w @oursay/web-app # tsc --noEmit
```

`npm run up` starts `@oursay/api`'s Docker stack (Postgres + immudb + API on
**:8080**, optional settlement worker via `AUTO_START_WORKER=1`), then runs Next
on **:3000** in live mode. Ctrl+C stops Next only; `npm run down` tears down the
compose stack.

The marketing site (`@oursay/site`, Astro) runs on its own port, so the two dev
servers don't collide.

The home route (`/`) redirects to `/feed`, the unified feed and the app's home.

## Views

The civic app lives under the `(app)` route group; a single client `AppShell`
([`src/views/AppShell.tsx`](src/views/AppShell.tsx)) supplies the shared header,
filter and jurisdiction popovers, FAB, modal stack, and toast. Each route maps to
one wireframe view and its user-flow screens:

| Route | View | Wireframe / user-flow screens |
|-------|------|-------------------------------|
| `/feed` | Unified feed | Feed (5.1) |
| `/jurisdiction/[slug]` | Jurisdiction hub | Jurisdiction selector, rules, ridings (5.6) |
| `/district/[slug]` | District (riding) hub | District map / directory (5.6) |
| `/profile/[handle]` | Public profile | Profile + Posts / Activity / Mentions (1.7) |
| `/post/[kind]` | Record detail | Statement / Petition / Poll / Result (5.2–5.4) |

Navigation follows the wireframe's **representative-target** model: because the
mock ships one sample per record kind and one representative profile/district,
tapping any card opens the sample for that `kind`, any author opens the
representative profile, and so on. Every such call site is marked
`// TODO(entityId)` — production swaps `[kind]` / `[handle]` / `[slug]` for real
record ids (see [`src/lib/routes.ts`](src/lib/routes.ts)).

## Client state

[`src/lib/state/`](src/lib/state/) holds the app's state, mirroring the
wireframe's global `state` object as a React context (`useApp()`):

- **Session / viewer** — logged-in flag, KYC tier, home districts (derived into a
  pure `ViewerContext` for the read-model helpers).
- **Filters** — record types, the Verified ladder, and the My Districts / Affected
  geography toggles (with the Verified-coupling from wireframe §4.4).
- **Jurisdiction subscriptions** — persisted to the `oursay-subs` cookie (Global
  default; works logged-out).
- **UI** — modal open flags (including `loginOtpWindow`), the compose flow, the
  Alberta sign-confirmation payload, and stubbed civic write state (reactions,
  votes, and the petition-signature overrides that drive the graduation demo).

## Count scaling (single layer)

Following wireframe §4.3, count scaling is a **display concern only** and lives in
the D2 card components, not the API:

- `listFeedItems` returns **raw** record counts.
- Card components thin social **reaction** counts via `scaleSocial` keyed off the
  active Verified tier, and surface the additive "+N unverified" civic note via
  `civicExtra`. Civic bars (signatures / votes) are never thinned.
- The comment-count **pill** always shows the record's true total.
- Post detail renders raw counts (`scale="detail"`).

Keeping scaling out of the API means raw server counts flow through unchanged once
it swaps to `fetch('/v1/public/...')`.

## Stub vs. real backend

Everything read-side is wired to the mock API; the write side is stubbed but
gated exactly as production will be.

| Surface | Today (stub) | Real backend |
|---------|--------------|--------------|
| Reads (feed, detail, places, profile) | Mock corpus via `src/lib/api/*` | `fetch('/v1/public/...')`, same signatures ([`CONTRACT.md`](src/lib/api/CONTRACT.md)) |
| Auth (register / OTP / login / passkey) | `requireAuth` gate + demo session (residency-verified) | WebAuthn + OTP + sessions |
| React / sign / vote / compose / reply | Local state; Global acts immediately, Alberta opens the WYSIWYS `SignModal` | Civic writes on the ledger |
| Petition → poll graduation | Signing the sample petition past its threshold flips its poll section live | Automatic graduation worker |
| Edit history, account settings, recovery | Toast "not built" | Real screens |
| Navigation targets | Representative sample per `kind` / `handle` / `slug` | Route by real `entityId` |

### `NEXT_PUBLIC_MOCK_ONLY` — mock vs. live

The web-app runs in two modes. The flag defaults to mock, so `npm run dev` with no
env is the offline demo.

**Mock mode (default — no backend needed):**

```bash
npm run dev -w @oursay/web-app        # http://localhost:3000, mock corpus
```

`NEXT_PUBLIC_MOCK_ONLY` unset / `1` / `true` → the `src/lib/api/*` layer reads the
ported mock corpus. No API, no Postgres. Auth, KYC, and civic writes are stubbed.

**Live mode (against `@oursay/api`):**

```bash
# One command — API compose (:8080) + Next live (:3000)
npm run up -w @oursay/web-app

# Optional: seed the civic corpus (separate; wipes auth/record rows on the dev DB)
npm run seed -w @oursay/api

# Or split across terminals:
npm run up  -w @oursay/api                              # Docker: API + DBs
NEXT_PUBLIC_MOCK_ONLY=0 npm run dev -w @oursay/web-app  # host Next
```

`NEXT_PUBLIC_MOCK_ONLY=0` (or `false`) → every `src/lib/api/*` function hits the real
API. Next's `rewrites()` proxies `/v1/*` → `http://localhost:8080` same-origin (override
with `OURSAY_API_URL`), so the session cookie flows without CORS. Register with a real
email OTP (the API container logs OTP codes), enroll a passkey, then browse the seeded
corpus and post/comment/vote for real.

> **KYC in dev:** keep `KYC_PROVIDER=stub` in `api/.env` for the offline walk — **Get verified**
> opens a Verify ID / Verify Residency chooser (stub uses `POST /v1/dev/kyc/attest` + platform
> residency attest). With `KYC_PROVIDER=didit` and `NEXT_PUBLIC_MOCK_ONLY=false`, the chooser
> starts hosted Didit sessions (`DIDIT_WORKFLOW_ID` / `DIDIT_WORKFLOW_POA`). Verified-account
> recovery uses `DIDIT_WORKFLOW_RECOVER`. See [`docs/DIDIT-KYC-SETUP.md`](../docs/DIDIT-KYC-SETUP.md).

Re-run `npm run seed -w @oursay/api` after running the api test suite — the tests share the
dev DB on 5442 and truncate it.

## Folder map

```
web-app/
├── src/
│   ├── app/                     Next.js App Router
│   │   ├── (app)/               The five civic routes + client shell layout
│   │   └── components/          D2 component gallery
│   ├── components/              D2 presentational components
│   ├── views/                   D3 view components + AppShell
│   └── lib/
│       ├── types/               Domain types (records, comments, jurisdiction,
│       │                        profile, verification, filters, viewer)
│       ├── mock/                Ported wireframe corpus + README field mapping
│       ├── read-model/          Pure helpers: relTime, scaling, geography, matches
│       ├── api/                 Mock-backed frontend API + CONTRACT.md
│       ├── state/               Client app state (AppProvider, cookies, filters)
│       └── routes.ts            Route path + slug helpers
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

## Scope (Phase D)

In: types, mock data, read-model helpers, mock-backed API, D2 components, and the
D3 app shell / five views with client state and stubbed civic interactions.
Out: real auth (WebAuthn, OTP, sessions), civic writes, live `/v1/public` calls,
entity-id routing, the edit-history timeline, and real map geometry.
