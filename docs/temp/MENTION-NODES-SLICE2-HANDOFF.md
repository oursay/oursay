# Handoff — Mention Nodes Slice 2 (API allocate / resolve / read + index)

**Branch:** `feat/mention-nodes`  
**Tag:** `[mention-nodes-slice2]`  
**Authoritative contract:** [`docs/entities/civic-identity/mention-node.md`](../entities/civic-identity/mention-node.md)  
**Plan (context only; doc wins on conflict):** Cursor plan `mention_nodes_mvp_8a738060`  

**No assumptions — ask the user when wire format, relate-rule edge cases, or scope are ambiguous.**

---

## Slice 1 status (done — do not redo)

Landed on the branch:

- Entity + glossary + WEB-APP-GAPS Part 2 corrections; titles/question noted as token-bearing.
- DDL in [`public-record/src/schema/postgres.sql.ts`](../../public-record/src/schema/postgres.sql.ts): `mention_map` (nullable `mentioned_user_id`, partial unique on related `(thread_id, user)`), `mention_index` (related only).
- Deferred V1 notes in [`docs/entities/civic-identity/future.md`](../entities/civic-identity/future.md) (official always-public mention; content-warning/doxxing filters).

**Not implemented yet** (Slice 1 deferred into this slice’s foundation):

- Store methods: `allocateOrGet`, `allocateUnresolved`, `getMentionMapByNodeIds`, `insertMentionIndex`
- Token build/parse helpers (canonical `<@` + `encodeUuidV4Base59(nodeId)` + `>`)
- Optional `validateContent` token-syntax checks
- Any prepare/submit/read wiring

---

## Slice 2 goal

Server can **allocate** mention nodes on civic **prepare** (near sign), **resolve** tokens on public read DTOs with the same visibility rules as author cards (plus unresolved → `Someone`), and **project** `mention_index` on submit for related mentions only.

**Out of scope (Slice 3+):** web-app compose `@` UX / chip embed before `contentHash`; Mentions tab live UI / remove `DEFERRED_MENTIONS`; official always-public mention carve-out; hate/doxxing content filters.

Clients may still submit content **without** tokens (plain `@handle` stays valid). Slice 2 must not require tokens on every write — only handle them when present / when prepare sends mention candidates.

---

## Locked rules (do not re-litigate)

1. Committed content stores **opaque tokens only** — never handle / reserved label / persona / profile strings for the mention.
2. Related: one node per `(thread_id, mentioned_user_id)`; soft-mode random reserved label until join+Pₜ; then persona/profile via `IdentityReadService` / effective visibility.
3. Unresolved (unknown or unauthorized profile `@` — same gate as profile 404): `mentioned_user_id` NULL, display **`Someone`**, not correlatable. In-thread **persona** `@` always relates; **profile** `@` only if commenter may view that profile (joined ≠ enough).
4. Tokens allowed in **title / body / text / question** (string fields). No committed AST.
5. Tokens must exist in final `content` **before** `contentCommitment({ id: txId, salt, content })` and envelope sign. Allocation folds into **prepare**, returns `nodeId`s for the client to embed (client embed itself is Slice 3; API must still return the mapping).
6. `mention_index` only for rows with `mentioned_user_id` set.
7. Soft-mode reserved labels: **random** + collision retry — not derived from `user_id`. Personas remain seeded from public Pₜ.

---

## Deliverables

### A. public-record foundation

| Item | Notes |
|------|--------|
| Token helpers | Build/parse `<@base59(uuid)>`; reuse `@oursay/encode`. Prefer one shared module importable by api (and later web-app). |
| `PrivateStore` methods | Per entity doc store contract: `allocateOrGet(threadId, userId)`, `allocateUnresolved(threadId)`, `getMentionMapByNodeIds`, `insertMentionIndex`. Soft-mode label mint: random + collision retry vs map labels + `thread_keys.persona_name`. Unresolved: fixed `Someone`. |
| Tests | Allocate idempotency (related); unresolved NULL user; parse round-trip; partial unique behavior. |

Optional: well-formed token checks in `validateContent` (opaque; length caps still apply to full string).

### B. Prepare path (allocate near sign)

| Layer | Work |
|-------|------|
| HTTP / OpenAPI | Extend `POST /v1/civic/appends/prepare` to accept mention candidates (handles and/or userIds — exact shape: ask if unclear). |
| [`CivicRecordService.prepare`](../../api/src/services/civic-record.service.ts) | After `rootEntityId` is known, apply **relate rules**, call allocate, return `mentionNodes` alongside existing `PreparedAppend` fields. |
| [`identity` types](../../identity/src/shared/types.ts) | Extend `PreparedAppend` (or adjacent response type) with `mentionNodes: [{ nodeId, userId? }, …]`. Thread through registry / client types as needed. |

Relate at prepare (authoritative on server even if client guessed):

- Persona name in this thread → always relate.
- Profile handle → relate only if commenter may view profile (`profileVisible` / same 404 gate).
- Else → `allocateUnresolved`.

Do **not** mint map rows long before prepare. Idempotent related allocate is required.

### C. Submit path (index)

After successful `appendSigned` / submit:

- Parse tokens from committed string fields in `content`.
- Lookup map rows; for each with `mentioned_user_id` set, `insertMentionIndex({ txId, entityId: thread root, mentionedUserId })`.
- Skip unresolved / unknown node ids (define behavior: ignore vs soft-fail — prefer ignore unknown tokens that don’t map, don’t fail the civic write).

### D. Read path (resolve + DTO metadata)

| Service | Work |
|---------|------|
| [`IdentityReadService`](../../api/src/services/identity-read.service.ts) / `ReadResolution` | Add `resolveMention` (or equivalent): NULL user → Someone; else soft-mode reserved or `resolveAuthor(Pₜ)`. Reuse `effectiveVisibility` / `isRevealed` / self branch. |
| [`record-detail.service.ts`](../../api/src/services/record-detail.service.ts), [`public-feed.service.ts`](../../api/src/services/public-feed.service.ts), persona page if it surfaces bodies | Keep `body: string[]` via `paras()` (tokens preserved in paragraphs). Scan title/body/text/question for tokens; batch `getMentionMapByNodeIds`; attach `mentions` map on DTO: `nodeId → { display, kind: reserved\|persona\|profile, route?, isSelf }`. |
| OpenAPI / HTTP schemas | Document new optional `mentions` field on feed/detail/comment DTOs. |

Short-circuit when no `<@…>` present (blast radius: non-mention records unchanged).

Client chip rendering is Slice 3 — server must still return resolvable metadata now so Slice 3 is display-only.

---

## Key file map

| Area | Path |
|------|------|
| Contract | `docs/entities/civic-identity/mention-node.md` |
| DDL | `public-record/src/schema/postgres.sql.ts` |
| Store | `public-record/src/private/store.ts` (+ persona-name collision patterns) |
| Commitment | `public-record/src/crypto/commitment.ts` (do not change hash semantics) |
| Encode | `encode/src/uuid-base59.ts` |
| Prepare/submit API | `api/src/services/civic-record.service.ts`, `api/src/http/routes/civic-record.routes.ts`, `api/openapi.yaml` |
| Identity types | `identity/src/shared/types.ts`, `identity/src/server/registry.ts` |
| Identity read | `api/src/services/identity-read.service.ts` |
| Feed / detail | `api/src/services/public-feed.service.ts`, `api/src/services/record-detail.service.ts` |
| Profile visibility gate | `IdentityReadService.profileVisible` (reuse for profile-@ relate) |

---

## Suggested implementation order

1. Token helpers + store allocate/get/index + unit tests.  
2. Prepare: candidates → relate → allocate → `mentionNodes` on response (OpenAPI + types).  
3. Submit: parse → `mention_index` for related.  
4. Read: `resolveMention` + feed/detail (and comment tree) `mentions` metadata + tests.  
5. Run package tests; propose commit message(s) — **do not commit** unless asked.

---

## Success criteria

- Prepare with a related candidate returns a stable `nodeId`; second prepare for same `(thread, user)` returns the same id.
- Prepare with unauthorized/unknown candidate returns a node with no user id; read resolves display to `Someone`.
- Related soft-mode (user not in `thread_keys`) resolves to reserved label; after join (in tests), same `nodeId` resolves via `resolveAuthor`.
- Submit of content containing related tokens writes `mention_index`; unresolved tokens do not.
- Feed/detail DTOs include `mentions` metadata when tokens present; records without tokens unchanged.
- `contentCommitment` / envelope verify unchanged — tokens are bytes inside existing string fields.
- Plain-text `@handle` without tokens still appends successfully and is not indexed.

---

## Risks / watch-outs

- **Template literals:** `POSTGRES_DDL` is backtick-delimited — never put raw `` ` `` inside SQL comment strings.
- **Partial unique:** multiple NULL `mentioned_user_id` rows are allowed; do not reintroduce `UNIQUE (thread_id, mentioned_user_id)` without `WHERE … IS NOT NULL`.
- **N+1 on feed:** batch map lookup + reuse per-request `ReadResolution` memos.
- **New-thread compose:** `thread_id` / allocate key must be prepare’s `rootEntityId`.
- **SDK client** still embeds tokens in Slice 3; Slice 2 API must be usable from tests/scripts that manually embed tokens after prepare.

---

## Test commands (PowerShell)

```powershell
cd C:\Projects\OurSay\oursay\public-record; npm test
cd C:\Projects\OurSay\oursay\encode; npm test
cd C:\Projects\OurSay\oursay\identity; npm test
cd C:\Projects\OurSay\oursay\api; npm test
```

---

## Coding-agent start prompt (copy-paste)

```
Implement Mention Nodes Slice 2: API allocate on prepare, resolve on read DTOs, mention_index on submit.

**No assumptions — ask when wire format or relate-rule edge cases are ambiguous.**

## Read first
- docs/temp/MENTION-NODES-SLICE2-HANDOFF.md (this handoff)
- docs/entities/civic-identity/mention-node.md (authoritative)
- public-record/src/schema/postgres.sql.ts (mention_map / mention_index DDL)
- api/src/services/civic-record.service.ts (prepare / submit)
- api/src/services/identity-read.service.ts (resolveAuthor / profileVisible)
- api/src/services/record-detail.service.ts + public-feed.service.ts (body paras + DTO shape)
- identity/src/shared/types.ts (PreparedAppend)

## Goals
1. Token helpers + PrivateStore allocateOrGet / allocateUnresolved / getMentionMapByNodeIds / insertMentionIndex.
2. Extend prepare to accept mention candidates, apply relate rules, return mentionNodes (nodeId + optional userId).
3. On submit, project mention_index for related tokens only.
4. On feed/detail (and comments), parse tokens, resolveMention, attach mentions metadata; keep body: string[].
5. Tests covering related idempotency, Someone/unresolved, soft-mode vs joined resolve, index omission for unresolved, no-token passthrough.

## Out of scope
Web-app compose embed/chips, Mentions tabs / DEFERRED_MENTIONS, official always-public mention, content-warning filters.

## Before you finish
Run the PowerShell test commands in the handoff. Propose commit message(s); do not commit unless asked.
```
