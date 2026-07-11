# MentionNode

## Definition

A **stable, opaque mention target** within one civic thread: one node per `(thread_id, mentioned_user_id)`. Authors compose with a handle typeahead; the committed record body stores only an inline **mention token** that encodes the node id. Viewers never re-derive privacy — the server resolves each token to a **reserved label**, **persona**, or **profile** using the same effective-visibility rules as author cards for the *mentioned* user ([09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md), [`IdentityReadService`](../../../api/src/services/identity-read.service.ts)).

Committed content **never** stores `@handle`, reserved label, persona name, or profile display — only the token. Free-text `@handle` in legacy bodies is **not** parsed or indexed.

## Aliases

| Layer | Name |
|-------|------|
| Product | Mention / @mention |
| Code | `MentionNode`, `mention_map` |
| Committed form | Inline token `<@` + base59(node id) + `>` |
| Read projection | `mention_index` (Mentions tabs) |

## Identity

Primary key: `mention_map.node_id` (UUID v4). Uniqueness enforced on `(thread_id, mentioned_user_id)` — the node is stable for the life of that pair. The committed token bytes encode `node_id` and **never change** when the mentioned user later joins the thread or when viewer privilege changes.

## Token format (committed body)

Mentions live inside existing string content fields — **not** a committed AST:

| Record type | Field |
|-------------|-------|
| `comment` | `CommentContent.body` |
| `post` | `PostContent.body` (optional) |
| `petition` | `PetitionContent.text` |

**Canonical token:**

```
<@` + encodeUuidV4Base59(nodeId) + `>
```

- `nodeId` is a UUID v4 (`mention_map.node_id`).
- Encoding uses `@oursay/encode` (`encodeUuidV4Base59` / `decodeUuidV4Base59`) — the same codec as URL entity ids.
- Example shape: `<@3kF9xQ…>` (length varies with leading-zero stripping; budget under body caps).
- Well-formed tokens are the **only** mention syntax recognized at read/index time. Plain `@alice` strings are ordinary text.

**Commitment ordering (hard requirement):** tokens must be present in the final `content` object **before** `contentCommitment({ id: txId, salt, content })` and envelope sign ([`public-record/src/crypto/commitment.ts`](../../../public-record/src/crypto/commitment.ts)). Allocation is folded into civic **prepare** (near sign); the client embeds returned node ids into `body`/`text`, then hashes and signs. See Write sequence below.

## Attributes (`mention_map`)

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `node_id` | UUID | yes | yes (via token) | Random UUID v4 at allocate |
| `thread_id` | TEXT | yes | yes | Root entity id (`PreparedAppend.rootEntityId`) |
| `mentioned_user_id` | UUID | yes | no | FK → `users.id` — never published on the token |
| `reserved_label` | TEXT | yes | yes (pre-join display) | **Random** mint + collision retry; persisted; **not** derived from `user_id` |
| `created_at` | TIMESTAMPTZ | yes | no | Allocate time |

### Reserved label (vs persona name)

| | Reserved label | Persona name |
|--|----------------|--------------|
| When | Mentioned user has **not** joined the thread (no `thread_keys` row) | User has joined; Pₜ exists |
| Seed | **Cryptographic / OS random** + collision retry | Deterministic from **public Pₜ** (`personaNameForPubkey`) |
| Persistence | `mention_map.reserved_label` | `thread_keys.persona_name` |
| Auditor property | Not reversible from `mentioned_user_id` (no dictionary oracle) | Reversible from public Pₜ by design |

Reserved labels use the same *display style* as personas (e.g. `AdjectiveAnimalNN`) so soft-mode mentions look native, but the mint **must not** hash `(thread_id, user_id)` or `user_id`. On collision with an existing `mention_map.reserved_label` or `thread_keys.persona_name`, retry with a fresh random candidate (widen numeric suffix or re-draw), same spirit as `freePersonaName`.

## Read resolution (MVP)

For each token → `node_id` → `mention_map` row:

```
getThreadKeyByUserThread(mentioned_user_id, thread_id)
  │
  ├─ null  → reserved (display = reserved_label; kind = reserved; no profile/persona route)
  │
  └─ Pₜ    → ReadResolution.resolveAuthor(Pₜ, threadCtx)
               ├─ revealed to viewer → profile (display / handle; kind = profile)
               └─ else               → persona (persona_name; kind = persona)
```

Same cascade as author cards: `effectiveVisibility` = `thread ?? account ?? anonymous`, then `isRevealed` against viewer KYC / official / district privilege. **Self** viewing a mention of themselves follows the same self branch as `resolveAuthor`.

**Deferred (V1 — not MVP):** official always-public direct profile mention special-case (always resolve officials to profile in mention text regardless of visibility). Tracked in [civic-identity/future.md](./future.md).

## States & lifecycle

```
[compose: author picks @handle → userId]
        │
        ▼
[prepare: allocateOrGet(thread_id, userId) — idempotent]
        │ returns { nodeId, reservedLabel } (label unused in committed body)
        ▼
[client embeds <@base59(nodeId)> into body/text]
        │ contentCommitment + envelope sign
        ▼
[submit: appendSigned; project mention_index from tokens]
        │
        ▼
[read: parse tokens → map → reserved | persona | profile]
        │
        ▼
[mentioned user joins thread → same node now resolves via Pₜ;
 node_id + committed token bytes unchanged]
```

Soft-mode: the map row (and reserved label) is created at allocate, which may be **before** the mentioned user has joined. Orphan rows from prepare-without-submit are acceptable — `allocateOrGet` is idempotent and reuses them on the next mention of the same user in the same thread.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| User (mentioned) | N:1 | `mentioned_user_id` |
| Thread root | N:1 | `thread_id` = root `entity_id` |
| ThreadPersona | 0..1 | Present after join; used for persona/profile resolve |
| RecordTransaction | N:M via `mention_index` | Which txs cite this user |
| Comment / Post / Petition content | embedded | Tokens inside string body fields |

## Invariants

- **Opaque commit:** `record_tx.content` must not contain `@handle`, reserved label, persona name, or profile display for the mention — only `<@base59(nodeId)>`.
- **UNIQUE(thread_id, mentioned_user_id):** one stable node per pair.
- **Token stability:** `node_id` and committed token bytes do not change across join or visibility changes.
- **No free-text index:** plain `@handle` is never parsed into `mention_index`.
- **Legacy bodies:** strings without tokens remain valid; read path short-circuits when no `<@…>` matches.
- **Reserved labels are non-derivable** from `mentioned_user_id` (random + persist).
- Length caps (`JurisdictionConfig.contentLimits`) apply to the **full** string including tokens.

## Permissions

| Action | Who |
|--------|-----|
| Allocate (`allocateOrGet`) | Authenticated author on civic prepare for that thread |
| Read resolved display | Public (viewer-dependent profile vs persona vs reserved) |
| Index / Mentions tab | Public list of txs that mention a user (subject to existing profile/persona 404 rules) |

## Events

- **Prepare:** `allocateOrGet` may insert `mention_map`.
- **Submit:** after `appendSigned`, project `mention_index` rows for each well-formed token in the committed body that maps to a known `node_id`.
- **Join:** no map mutation — resolution switches from reserved → persona/profile automatically.

## Projection: `mention_index`

Write-time index for profile and persona **Mentions** tabs (replaces `DEFERRED_MENTIONS`).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `tx_id` | TEXT | yes | Citing transaction |
| `entity_id` | TEXT | yes | Thread root (`thread_id`) |
| `mentioned_user_id` | UUID | yes | FK → `users.id` |
| `created_at` | TIMESTAMPTZ | yes | Projection time |
| PK | `(tx_id, mentioned_user_id)` | | One row per (tx, mentioned user) |

Built by parsing committed content tokens → `mention_map` → `mentioned_user_id`. **Not** by scanning `@handle` text.

## Write sequence (compose → prepare/allocate → embed → hash/sign → append → index)

1. Compose: typeahead resolves handle → `userId` (roster / public-handle policy — implementation).
2. `POST /v1/civic/appends/prepare` with intent + `mentions: [{ userId }, …]`.
3. Server: `prepareAppend` → `rootEntityId`; for each mention, `allocateOrGet(rootEntityId, userId)`.
4. Response: `PreparedAppend` + `mentionNodes: [{ userId, nodeId }, …]`.
5. Client: replace compose placeholders with `<@base59(nodeId)>` in `body`/`text` (**final content**).
6. Client: `contentHash = contentCommitment({ id: txId, salt, content })`; sign envelope.
7. `POST /v1/civic/appends/submit` → `appendSigned` (hash must match token-bearing content).
8. Server: project `mention_index` from tokens in submitted content.

## Read sequence (load → parse → resolve → DTO)

1. Load `content` string field; `paras()` still produces `body: string[]` (tokens preserved inside paragraphs — double-newline split unchanged).
2. If no `<@…>` match → no mention work.
3. Decode tokens → `node_id`s; batch-load `mention_map`.
4. For each row: reserved **or** `resolveAuthor(Pₜ)` via `IdentityReadService`.
5. Return `body: string[]` plus `mentions: { [nodeId]: { display, kind, route?, isSelf } }` — server resolves; client chips/links only.

## Examples

**Valid:** Comment body `Thanks <@3kF9xQabCdEfGhIjKlMn> for the clarification.` — token maps to a `mention_map` row; viewers see reserved/persona/profile per privilege.

**Invalid:** Committing `Thanks @alice` and expecting Mentions-tab indexing — free-text handle is not a token and is not indexed.

**Invalid:** Deterministic `reserved_label = f(user_id)` or `f(thread_id, user_id)` — forbidden (dictionary oracle).

## Proposed schema (DDL)

Target tables in `public-record/src/schema/postgres.sql.ts` (private Postgres — not on the public chain):

```sql
-- Stable opaque mention target: one node per (thread, mentioned user).
CREATE TABLE IF NOT EXISTS mention_map (
  node_id            UUID PRIMARY KEY,
  thread_id          TEXT NOT NULL,              -- root entity id
  mentioned_user_id  UUID NOT NULL REFERENCES users(id),
  reserved_label     TEXT NOT NULL UNIQUE,       -- random mint; collision-retry; not from user_id
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (thread_id, mentioned_user_id)
);
CREATE INDEX IF NOT EXISTS mention_map_thread ON mention_map (thread_id);
CREATE INDEX IF NOT EXISTS mention_map_user ON mention_map (mentioned_user_id);

-- Write-time Mentions-tab projection (from tokens → map → user_id; never from free-text @handle).
CREATE TABLE IF NOT EXISTS mention_index (
  tx_id              TEXT NOT NULL,
  entity_id          TEXT NOT NULL,              -- thread root
  mentioned_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tx_id, mentioned_user_id)
);
CREATE INDEX IF NOT EXISTS mention_index_user ON mention_index (mentioned_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mention_index_entity ON mention_index (entity_id);
```

### Store contract (target — not yet wired)

| Method | Behavior |
|--------|----------|
| `allocateOrGet(threadId, userId)` | Insert-or-return row; mint random `reserved_label` with collision retry against `mention_map` + `thread_keys.persona_name`; return `{ nodeId, reservedLabel }` |
| `getMentionMapByNodeIds(ids)` | Batch lookup for read resolve |
| `insertMentionIndex(rows)` | Post-submit projection |

## Implementation

| Layer | Path | Status |
|-------|------|--------|
| Entity doc | `docs/entities/civic-identity/mention-node.md` | this file |
| DDL | `public-record/src/schema/postgres.sql.ts` | proposed / landed empty tables |
| Token codec | `@oursay/encode` (build/parse helpers) | target Slice 1 follow-on |
| Content validation | `public-record/src/schema/content.ts` (optional well-formed token check) | target |
| Allocate on prepare | `api` + `identity` `PreparedAppend` | Slice 2 |
| Resolve + read DTO | `IdentityReadService` + feed/detail | Slice 2 |
| Compose embed | `web-app` + `identity` session build | Slice 3 |
| Mentions tabs | profile/persona APIs; drop `DEFERRED_MENTIONS` | Slice 4 |

## Gaps

- **Store methods + prepare/submit wiring** — Slice 2+.
- **Official always-public mention special-case** — deferred V1; see [future.md](./future.md).
- **Typeahead privacy** — compose must not leak existence of fully anonymous accounts; prefer thread roster + already-public handles (product policy for Slice 3).
- **Orphan map rows** — prepare without submit; acceptable; optional later sweep of rows never referenced by `mention_index`.
