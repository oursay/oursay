# MentionNode

## Definition

A **stable, opaque mention target** within one civic thread. When the system **relates** a mention to a user, there is one node per `(thread_id, mentioned_user_id)`. Authors compose with `@` handle spans (compose may typeahead / split at the next non-handle character; empty `@` is ignored); the committed string fields store only an inline **mention token** that encodes the node id. Viewers never re-derive privacy — the server resolves each token to **`Someone`**, a **reserved label**, **persona**, or **profile** ([09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md), [`IdentityReadService`](../../../api/src/services/identity-read.service.ts)).

Committed content **never** stores `@handle`, reserved label, persona name, or profile display — only the token. Free-text `@handle` remains valid API content and is **not** parsed or indexed (only well-formed tokens are mention nodes).

## Aliases

| Layer | Name |
|-------|------|
| Product | Mention / @mention |
| Code | `MentionNode`, `mention_map` |
| Committed form | Inline token `<@` + base59(node id) + `>` |
| Read projection | `mention_index` (Mentions tabs; related rows only) |

## Identity

Primary key: `mention_map.node_id` (UUID v4). For **related** mentions, uniqueness is enforced on `(thread_id, mentioned_user_id)` where `mentioned_user_id IS NOT NULL` — that node is stable for the life of that pair. **Unresolved** mentions (unknown handle, or a profile the commenter is not allowed to mention — same gate as profile 404) store `mentioned_user_id` NULL and are not correlatable to a user. The committed token bytes encode `node_id` and **never change** when a related user later joins the thread or when viewer privilege changes.

## Token format (committed strings)

Mentions live inside existing string content fields — **not** a committed AST — including **titles**:

| Record type | Fields |
|-------------|--------|
| `comment` | `CommentContent.body` |
| `post` | `PostContent.title`, `PostContent.body` (optional) |
| `petition` | `PetitionContent.title`, `PetitionContent.text` |
| `poll` | `PollContent.question` (and description if present) |

**Canonical token:** concatenation of `<@`, `encodeUuidV4Base59(nodeId)`, and `>`.

- `nodeId` is a UUID v4 (`mention_map.node_id`).
- Encoding uses `@oursay/encode` (`encodeUuidV4Base59` / `decodeUuidV4Base59`) — the same codec as URL entity ids.
- Example shape: `<@3kF9xQ…>` (length varies with leading-zero stripping; budget under body caps).
- Well-formed tokens are the **only** mention syntax recognized at read/index time. Plain `@alice` strings are ordinary text.

**Commitment ordering (hard requirement):** tokens must be present in the final `content` object **before** `contentCommitment({ id: txId, salt, content })` and envelope sign ([`public-record/src/crypto/commitment.ts`](../../../public-record/src/crypto/commitment.ts)). Allocation is folded into civic **prepare** (near sign); the client embeds returned node ids into `title`/`body`/`text`/`question`, then hashes and signs. See Write sequence below.

## Relate rules (prepare)

The system sets `mentioned_user_id` only when the commenter is authorized to name that target:

| Compose target | Relate? |
|----------------|---------|
| In-thread **persona name** | Always (a persona name exists only after that user joined the thread) |
| **Profile handle** | Only if the commenter may view that profile (would not 404). Being joined in the same thread is **not** enough — prevents using a profile `@` to force a persona↔profile link unless the profile is visible in the thread already |
| Unknown / unauthorized / empty `@` | Unresolved: `mentioned_user_id` NULL; display **`Someone`** |

## Attributes (`mention_map`)

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `node_id` | UUID | yes | yes (via token) | Random UUID v4 at allocate |
| `thread_id` | TEXT | yes | yes | Root entity id (`PreparedAppend.rootEntityId`) |
| `mentioned_user_id` | UUID | no | no | FK → `users.id` when related; **NULL** when unresolved — never published on the token |
| `reserved_label` | TEXT | yes | yes | Related soft-mode: **random** mint + collision retry. Unresolved: fixed **`Someone`**. Not derived from `user_id` |
| `created_at` | TIMESTAMPTZ | yes | no | Allocate time |

### Reserved label (vs persona name) vs `Someone`

| | Soft-mode reserved label | `Someone` (unresolved) | Persona name |
|--|--------------------------|------------------------|--------------|
| When | Related user has **not** joined the thread (no `thread_keys` row) | Unknown handle, or profile the commenter may not mention | Related user has joined; Pₜ exists |
| Seed | **Cryptographic / OS random** + collision retry | Fixed string `Someone` | Deterministic from **public Pₜ** (`personaNameForPubkey`) |
| Persistence | `mention_map.reserved_label` | `mention_map.reserved_label` | `thread_keys.persona_name` |
| Auditor property | Not reversible from `mentioned_user_id` (no dictionary oracle) | `mentioned_user_id` is NULL — not correlatable | Reversible from public Pₜ by design |

Soft-mode reserved labels use the same *display style* as personas (e.g. `AdjectiveAnimalNN`) so related pre-join mentions look native, but the mint **must not** hash `(thread_id, user_id)` or `user_id`. On collision with an existing `mention_map.reserved_label` or `thread_keys.persona_name`, retry with a fresh random candidate (widen numeric suffix or re-draw), same spirit as `freePersonaName`. Unresolved rows all display **`Someone`** (label need not be globally unique).

## Read resolution (MVP)

For each token → `node_id` → `mention_map` row:

```
mentioned_user_id IS NULL?
  │
  ├─ yes  → Someone (kind = reserved; no route; never resolves to an author)
  │
  └─ no   → getThreadKeyByUserThread(mentioned_user_id, thread_id)
               ├─ null  → reserved (display = reserved_label; kind = reserved; no profile/persona route)
               └─ Pₜ    → ReadResolution.resolveAuthor(Pₜ, threadCtx)
                            ├─ revealed to viewer → profile (display = wire handle; kind = profile)
                            └─ else               → persona (persona_name; kind = persona)
```

Same cascade as author cards for **related** users: `effectiveVisibility` = `thread ?? account ?? anonymous`, then `isRevealed` against viewer KYC / official / district privilege. **Self** viewing a mention of themselves follows the same self branch as `resolveAuthor`.

**Deferred (V1 — not MVP):** official always-public direct profile mention special-case (always resolve officials to profile in mention text regardless of visibility). Tracked in [civic-identity/future.md](./future.md).

## States & lifecycle

```
[compose: @handle span → prepare candidate]
        │
        ▼
[prepare: relate? allocateOrGet(thread, userId) : allocateUnresolved(thread)]
        │ returns { nodeId, … } (label unused in committed content)
        ▼
[client embeds <@base59(nodeId)> into title/body/text/question]
        │ contentCommitment + envelope sign
        ▼
[submit: appendSigned; project mention_index for related tokens only]
        │
        ▼
[read: parse tokens → map → Someone | reserved | persona | profile]
        │
        ▼
[related user joins thread → same node now resolves via Pₜ;
 node_id + committed token bytes unchanged]
```

Soft-mode (related): the map row (and reserved label) is created at allocate, which may be **before** the mentioned user has joined. Orphan rows from prepare-without-submit are acceptable — `allocateOrGet` is idempotent and reuses them on the next related mention of the same user in the same thread. Unresolved rows never gain a `mentioned_user_id`.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| User (mentioned) | 0..1 | `mentioned_user_id`; NULL when unresolved |
| Thread root | N:1 | `thread_id` = root `entity_id` |
| ThreadPersona | 0..1 | Present after join; used for persona/profile resolve |
| RecordTransaction | N:M via `mention_index` | Related mentions only |
| Comment / Post / Petition / Poll content | embedded | Tokens inside title/body/text/question strings |

## Invariants

- **Opaque commit:** `record_tx.content` must not contain `@handle`, reserved label, persona name, or profile display for the mention — only `<@base59(nodeId)>`.
- **Partial UNIQUE(thread_id, mentioned_user_id) WHERE mentioned_user_id IS NOT NULL:** one stable related node per pair.
- **Unresolved rows** never store a user id (not correlatable to unauthorized targets).
- **Token stability:** `node_id` and committed token bytes do not change across join or visibility changes.
- **No free-text index:** plain `@handle` is never parsed into `mention_index` (and remains allowed content).
- **Legacy / non-token strings:** strings without tokens remain valid; read path short-circuits when no `<@…>` matches.
- **Soft-mode reserved labels are non-derivable** from `mentioned_user_id` (random + persist).
- Length caps (`JurisdictionConfig.contentLimits`) apply to the **full** string including tokens.

## Permissions

| Action | Who |
|--------|-----|
| Allocate (`allocateOrGet` / `allocateUnresolved`) | Authenticated author on civic prepare for that thread |
| Read resolved display | Public (viewer-dependent profile vs persona vs reserved when related; `Someone` when unresolved) |
| Index / Mentions tab | Related `mention_index` rows only (subject to existing profile/persona 404 rules) |

## Events

- **Prepare:** `allocateOrGet` or `allocateUnresolved` may insert `mention_map`.
- **Submit:** after `appendSigned`, project `mention_index` rows for each well-formed token whose map row has `mentioned_user_id` set.
- **Join:** no map mutation — related soft-mode resolution switches from reserved → persona/profile automatically.

## Projection: `mention_index`

Write-time index for profile and persona **Mentions** tabs (replaces `DEFERRED_MENTIONS`).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `tx_id` | TEXT | yes | Citing transaction |
| `entity_id` | TEXT | yes | Thread root (`thread_id`) |
| `mentioned_user_id` | UUID | yes | FK → `users.id` |
| `created_at` | TIMESTAMPTZ | yes | Projection time |
| PK | `(tx_id, mentioned_user_id)` | | One row per (tx, mentioned user) |

Built by parsing committed content tokens → `mention_map` → `mentioned_user_id` **when set**. Unresolved tokens (`mentioned_user_id` NULL) are omitted. **Not** by scanning `@handle` text.

## Write sequence (compose → prepare/allocate → embed → hash/sign → append → index)

1. Compose: `@` → non-empty handle span; typeahead / helpers may resolve handle → `userId` when related (implementation). Plain-text `@…` without a token is still accepted by the API.
2. `POST /v1/civic/appends/prepare` with intent + mention candidates (handles and/or userIds).
3. Server: `prepareAppend` → `rootEntityId`; for each candidate, apply relate rules → `allocateOrGet(rootEntityId, userId)` or `allocateUnresolved(rootEntityId)`.
4. Response: `PreparedAppend` + `mentionNodes: [{ userId?, nodeId }, …]`.
5. Client: replace compose placeholders with `<@base59(nodeId)>` in title/`body`/`text`/`question` (**final content**).
6. Client: `contentHash = contentCommitment({ id: txId, salt, content })`; sign envelope.
7. `POST /v1/civic/appends/submit` → `appendSigned` (hash must match token-bearing content).
8. Server: project `mention_index` from related tokens in submitted content.

## Read sequence (load → parse → resolve → DTO)

1. Load committed string fields (title/`body`/`text`/`question`); `paras()` still produces `body: string[]` (tokens preserved inside paragraphs — double-newline split unchanged). Titles remain strings and may contain tokens.
2. If no `<@…>` match → no mention work.
3. Decode tokens → `node_id`s; batch-load `mention_map`.
4. For each row: `Someone` if unresolved; else reserved **or** `resolveAuthor(Pₜ)` via `IdentityReadService`.
5. Return `body: string[]` (and title strings) plus `mentions: { [nodeId]: { display, kind, route?, isSelf } }` — server resolves; client chips/links only.

## Examples

**Valid related:** Comment body `Thanks <@3kF9xQabCdEfGhIjKlMn> for the clarification.` — token maps to a related `mention_map` row; viewers see reserved/persona/profile per privilege.

**Valid unresolved:** Unauthorized or unknown `@` → token with `mentioned_user_id` NULL; everyone sees `Someone`.

**Not indexed (still allowed):** Committing `Thanks @alice` as plain text — free-text handle is not a token and is not indexed.

**Invalid:** Storing an unauthorized `mentioned_user_id`, or deterministic `reserved_label = f(user_id)` / `f(thread_id, user_id)` (dictionary oracle).

## Proposed schema (DDL)

Target tables in `public-record/src/schema/postgres.sql.ts` (private Postgres — not on the public chain):

```sql
-- Stable opaque mention target. Related: one node per (thread, user). Unresolved: user id NULL → Someone.
CREATE TABLE IF NOT EXISTS mention_map (
  node_id            UUID PRIMARY KEY,
  thread_id          TEXT NOT NULL,              -- root entity id
  mentioned_user_id  UUID REFERENCES users(id),  -- NULL = unresolved (Someone)
  reserved_label     TEXT NOT NULL,              -- Someone | random soft-mode label
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mention_map_thread_user
  ON mention_map (thread_id, mentioned_user_id)
  WHERE mentioned_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mention_map_thread ON mention_map (thread_id);
CREATE INDEX IF NOT EXISTS mention_map_user ON mention_map (mentioned_user_id)
  WHERE mentioned_user_id IS NOT NULL;

-- Write-time Mentions-tab projection (related tokens only; never from free-text @handle).
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
| `allocateOrGet(threadId, userId)` | Related insert-or-return; mint random soft-mode `reserved_label` with collision retry against `mention_map` + `thread_keys.persona_name`; return `{ nodeId, reservedLabel }` |
| `allocateUnresolved(threadId)` | New row with `mentioned_user_id` NULL and `reserved_label = Someone`; return `{ nodeId }` |
| `getMentionMapByNodeIds(ids)` | Batch lookup for read resolve |
| `insertMentionIndex(rows)` | Post-submit projection (related only) |

## Implementation

| Layer | Path | Status |
|-------|------|--------|
| Entity doc | `docs/entities/civic-identity/mention-node.md` | this file |
| DDL | `public-record/src/schema/postgres.sql.ts` | landed |
| Token codec | `@oursay/encode` (`buildMentionToken` / `parseMentionTokens`) | Slice 2 |
| Store allocate / index | `PrivateStore` allocateOrGet / allocateUnresolved / getMentionMapByNodeIds / insertMentionIndex | Slice 2 |
| Allocate on prepare | `CivicRecordService.prepare` + `PreparedAppend.mentionNodes` | Slice 2 |
| Resolve + read DTO | `IdentityReadService.resolveMention` + feed/detail `mentions` | Slice 2 |
| Compose embed | `web-app` + `identity` CivicHttpClient.append | Slice 3 landed |
| Mentions tabs | profile/persona APIs; drop `DEFERRED_MENTIONS` | Slice 4 |

## Gaps

- **Mentions tabs / DEFERRED_MENTIONS** — Slice 4.
- **Official always-public mention special-case** — deferred V1; see [future.md](./future.md).
- **Compose helpers dropdown** — makes unauthorized → `Someone` obvious at chip time (future UX).
- **Handle collision tightening** — ordered spans + candidates; collision UX post-dev / MVP polish.
- **Content warnings / hate / doxxing filters** (plain-text handle bypass of compose `@` detection) — deferred; see [future.md](./future.md).
- **Orphan map rows** — prepare without submit; acceptable; optional later sweep of rows never referenced by `mention_index`.
- **Cross-thread anon persona tagging** — future; MVP roster is in-thread only.
