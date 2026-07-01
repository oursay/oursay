# Frontend API contract

This document is the frontend's requirements document for the backend. It lists
what each function in `web-app/src/lib/api/*` needs, how the mock substitutes for
it today, and what HTTP the real `@oursay/api` should eventually provide.

All functions are mock-backed now (they read the ported wireframe corpus in
`web-app/src/lib/mock/`). Return types reference `web-app/src/lib/types/`. The
existing public API surface is [`api/openapi.yaml`](../../../../api/openapi.yaml)
(`/v1/public/...`).

Swap plan: each function keeps its signature and return type; only the body
changes from "read mock" to `fetch('/v1/public/...')` + map to the DTOs here.

## Part 1 — Maps to existing OpenAPI

Per frontend function: return type, existing route(s), query params, and how the
mock maps today.

| Frontend function | Return type | Existing route(s) | Query params | Notes |
|-------------------|-------------|-------------------|--------------|-------|
| `listFeedItems` | `FeedItem[]` | `GET /v1/public/posts`, `GET /v1/public/petitions`, `GET /v1/public/polls` (per-type lists; **no unified feed endpoint**) | `scope`, `tier`, `jurisdiction`, `from`, `to`, `limit`, `offset` (echoed, not resolved server-side) | Mock merges all kinds and filters client-side via `matches` + thins social counts via `scaleSocial`. Unified-feed decision → Part 2. |
| `getRecordDetail` (statement) | `{ detail: RecordDetail; comments: CommentNode[] }` | `GET /v1/public/posts/{id}` | — | Detail from posts; comments are a gap → Part 2. |
| `getRecordDetail` (petition) | `{ detail; comments }` | `GET /v1/public/petitions/{id}` + `GET /v1/public/petitions/{id}/counts` | — | Signature totals via `/counts`. |
| `getRecordDetail` (poll) | `{ detail; comments }` | `GET /v1/public/polls/{id}` + `GET /v1/public/polls/{id}/counts` | — | Vote totals via `/counts`. |
| `getRecordDetail` (result) | `{ detail; comments }` | `GET /v1/public/polls/{id}` + poll `results` sub-resource | — | **No standalone `/v1/public/results`** — the `result` kind maps onto poll results. |
| `getJurisdiction` | `JurisdictionSummary` | `GET /v1/public/jurisdictions` | — | Leader + rules are not on the current list response — mock fills; detail route → Part 2. |
| `listDistricts` | `DistrictSummary[]` | `GET /v1/public/jurisdictions/{jurisdictionId}/districts` | — | Names/leaders map directly. |
| `getDistrict` | `DistrictDetail` | `GET /v1/public/jurisdictions/{jurisdictionId}/districts` (+ slug filter) | — | About/boundary/leader detail not on the current API — mock fills; detail route → Part 2. |
| `getProfile` | `PublicProfile` | *(none)* | — | Gap → Part 2. |
| `listProfilePosts` / `listProfileActivity` / `listProfileMentions` | `ProfilePost[]` / `ActivityItem[]` / `MentionItem[]` | *(none)* | — | Gap → Part 2. |
| `getJurisdictionMembership` | `JurisdictionMembership[]` | *(none — client cookie)* | — | Gap → Part 2. |

Counts sub-resources for aggregates that resolve geo/tier server-side:
`GET /v1/public/posts/{id}/counts`, `/petitions/{id}/counts`, `/polls/{id}/counts`.

## Part 2 — Gap analysis & proposed backend endpoints

Every wireframe read surface that the current `/v1/public/...` cannot satisfy
alone. Each proposal notes the frontend function(s), the UI surface, a concrete
route, a brief response shape (referencing `web-app/src/lib/types/`), whether it
extends an existing resource or is net-new, and a priority note.

### 1. Unified feed
- **Function(s):** `listFeedItems`
- **UI surface:** Feed view (all record kinds across multiple jurisdictions, one list).
- **Proposed:** `GET /v1/public/feed?jurisdictions[]&types[]&tier&scope&limit&offset`
  returning `{ items: FeedItem[]; nextOffset?: number }`. **Interim:** document
  that the client merges the three per-type lists and filters via `matches`.
- **Extend / new:** Net-new (or accept the client-merge interim).
- **Priority:** Blocks D3 feed view (interim unblocks it for mock/dev).

### 2. Public profile by handle
- **Function(s):** `getProfile`
- **UI surface:** Profile view header (name, handle, role, tier, stats).
- **Proposed:** `GET /v1/public/profiles/{handle}` → `PublicProfile` (without the
  tab collections, which paginate separately below).
- **Extend / new:** Net-new (no public profile route today).
- **Priority:** Blocks D3 profile view.

### 3. Profile posts
- **Function(s):** `listProfilePosts`
- **UI surface:** Profile Posts tab (authored root records).
- **Proposed:** `GET /v1/public/profiles/{handle}/posts?types[]&limit&offset` →
  `{ items: FeedItem[] }`.
- **Extend / new:** Net-new.
- **Priority:** Blocks D3 profile view.

### 4. Profile activity
- **Function(s):** `listProfileActivity`
- **UI surface:** Profile Activity tab (posts, comments, edits, reactions, votes
  as first-class actions — nothing silently rewritten).
- **Proposed:** `GET /v1/public/profiles/{handle}/activity?kinds[]&limit&offset` →
  `{ items: ActivityItem[] }`.
- **Extend / new:** Net-new (requires a per-author action projection).
- **Priority:** Blocks D3 profile view.

### 5. Profile mentions
- **Function(s):** `listProfileMentions`
- **UI surface:** Profile Mentions tab (others referencing `@handle`).
- **Proposed:** `GET /v1/public/profiles/{handle}/mentions?limit&offset` →
  `{ items: MentionItem[] }`.
- **Extend / new:** Net-new (requires mention indexing).
- **Priority:** Blocks D3 profile view.

### 6. Nested comment trees
- **Function(s):** `getRecordDetail`
- **UI surface:** Post view comment thread (nested replies, depth ≤ 3).
- **Proposed:** `GET /v1/public/{posts|petitions|polls}/{id}/comments?depth=3` →
  `{ items: CommentNode[] }` (tree; `replies[]` nested).
- **Extend / new:** Extend each record resource with a `comments` sub-resource.
- **Priority:** Blocks D3 post view.

### 7. Edit / revision counts
- **Function(s):** `getRecordDetail`, `listFeedItems`
- **UI surface:** "N edits" link on the post and on revised comments; feed card
  footer edit link.
- **Proposed:** Add `editCount: number` to record detail responses and to each
  `CommentNode` in the comments sub-resource; surface it on feed list items too.
- **Extend / new:** Extend existing responses (field addition).
- **Priority:** Blocks D2 edit affordance.

### 8. Jurisdiction detail (config)
- **Function(s):** `getJurisdiction`
- **UI surface:** Jurisdiction view (leader, rules list, ridings).
- **Proposed:** `GET /v1/public/jurisdictions/{id}` → `JurisdictionSummary`
  (detail, not just the list entry).
- **Extend / new:** Extend the jurisdictions resource with a detail route.
- **Priority:** Blocks D3 jurisdiction view.

### 9. District detail
- **Function(s):** `getDistrict`
- **UI surface:** District view (about, boundary year/source, leader).
- **Proposed:** `GET /v1/public/jurisdictions/{jurisdictionId}/districts/{slug}` →
  `DistrictDetail`.
- **Extend / new:** Extend the districts resource with a by-slug detail route.
- **Priority:** Blocks D3 district view.

### 10. Jurisdiction membership / subscriptions
- **Function(s):** `getJurisdictionMembership`
- **UI surface:** Jurisdiction selector (subscribed list, cookie-persisted, works
  logged-out; Global default).
- **Proposed:** Client cookie for the MVP; optionally
  `GET /v1/me/jurisdiction-memberships` → `JurisdictionMembership[]` once auth
  lands (server-synced subscriptions).
- **Extend / new:** Net-new (auth-scoped) — not required while cookie-backed.
- **Priority:** Not blocking D1/D2; needed for D3 logged-in parity.

### 11. Poll / result interlinks
- **Function(s):** `getRecordDetail` (poll, result)
- **UI surface:** "Source Petition" / "Poll" / "Result" collapsibles on the
  detail page (the petition→poll→result graduation chain).
- **Proposed:** Add linkage fields to detail responses:
  `sourcePetitionId`, `sourcePollId`, `resultId` (nullable) so the client can
  render and route the "See full X →" interlinks by id.
- **Extend / new:** Extend poll/petition/result detail responses.
- **Priority:** Blocks D3 post view (interlinks).

### 12. Attached (proposed) poll on a petition
- **Function(s):** `getRecordDetail` (petition)
- **UI surface:** Petition "Proposed Poll" section + graduation demo.
- **Proposed:** Include `attachedPoll: { question: string; options: string[] }`
  (nullable) on the petition detail response.
- **Extend / new:** Extend the petition detail response (field addition).
- **Priority:** Blocks D3 petition view.

### 13. Action signTier on read surfaces
- **Function(s):** `listFeedItems`, `getRecordDetail`, comment sub-resources
- **UI surface:** "Signed" badge beside KYC pills; Signed Refine filter (Any /
  Passkey / Biometric ladder, inclusive-upward on `signTier`) on feed/
  jurisdiction/district lists and Post comment threads. Biometric step is
  development-only in the filter UI until biometric tiers ship.
- **Proposed:** Project `signTier: 0 | 1 | 2 | 3` onto feed items, record detail,
  and `CommentNode` (absent ⇒ `0`). UI projection parallel to KYC `tier`:
  `0` = derived-key (`p256` envelope path, no pill); `1` = passkey (Key icon,
  current app); `2` = fingerprint; `3` = face scan (planned). Backend derives
  `signTier` from envelope `signScheme` plus authenticator metadata — the
  cryptographic scheme (`p256` | `webauthn-es256`) stays on the envelope layer.
  Pill label is always "Signed" (passkey-signed class). Orthogonal to KYC tier
  and viewer petition participation state.
- **Extend / new:** Field addition on existing list/detail/comment responses.
- **Priority:** Blocks Signed badge + filter (mock fills today).

---

Mocks fill all of the above today. Each entry is a concrete proposal the API team
can implement; field-addition gaps (7, 11, 12, 13) are the cheapest and unblock the
most UI.
