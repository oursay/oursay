# Handoff — Mention Nodes Slice 3 (web-app compose embed + read chips)

**Status: landed on `feat/mention-nodes` (this session).** Next: Slice 4 (Mentions tabs / drop `DEFERRED_MENTIONS`).

**Branch:** `feat/mention-nodes`  
**Tag:** `[mention-nodes-slice3]`  
**Authoritative contract:** [`docs/entities/civic-identity/mention-node.md`](../entities/civic-identity/mention-node.md)  
**Plan (context only; doc wins on conflict):** Cursor plan `mention_nodes_mvp_8a738060`  
**Prior handoff:** [`MENTION-NODES-SLICE2-HANDOFF.md`](./MENTION-NODES-SLICE2-HANDOFF.md)

**No assumptions — ask the user when compose UX, typeahead privacy scope, or embed-layer placement (SDK vs web-app) are ambiguous.**

---

## Slice 2 status (done — do not redo)

Landed on the branch:

- Token helpers in [`encode/src/mention-token.ts`](../../encode/src/mention-token.ts): `buildMentionToken` / `parseMentionTokens` / `collectMentionNodeIds`.
- `PrivateStore`: `allocateOrGet`, `allocateUnresolved`, `getMentionMapByNodeIds`, `insertMentionIndex` (+ random reserved-label mint).
- Prepare accepts `mentions` candidates; returns `PreparedAppend.mentionNodes`.
- Submit projects `mention_index` for related tokens only (best-effort; ignore unknown/unresolved).
- Read: `ReadResolution.resolveMention` + optional `mentions` map on feed / detail / comments / persona comment bodies.
- Shared OpenAPI fragments: [`api/src/http/routes/public-page.schemas.ts`](../../api/src/http/routes/public-page.schemas.ts) (`mentionResolvedSchema` / `mentionsMapSchema`).
- Tests: `encode/test/mention-token.spec.ts`, `public-record/test/19-mention-map.spec.ts`, `api/test/37-mention-nodes.spec.ts`.

### Locked prepare wire format (Slice 2 — reuse as-is)

```ts
// request
mentions?: Array<
  | { kind: "persona"; personaName: string }
  | { kind: "profile"; userId?: string; handle?: string }  // at least one of userId|handle
>;

// response (order matches request)
mentionNodes?: Array<{ nodeId: string; userId?: string }>;  // userId omitted ⇒ unresolved Someone
```

SDK already accepts optional mentions on [`CivicHttpClient.prepare`](../../identity/src/client/civic-http-client.ts). **`append` / `createPost` / `createComment` do not yet pass mentions or embed tokens** — that is Slice 3 work.

---

## Slice 3 goal

Web-app (and SDK write path) can **compose** `@` spans into mention candidates, **allocate** via prepare, **embed** `<@base59(nodeId)>` into committed string fields **before** `contentHash` / sign, and **render** server-provided `mentions` metadata as chips on feed/detail/comments.

**Out of scope (Slice 4+):** Mentions tabs backed by `mention_index`; remove `DEFERRED_MENTIONS`; official always-public mention carve-out; hate/doxxing content filters; optional `validateContent` token-syntax checks.

Plain-text `@handle` without a composed mention span must remain valid and unindexed (no forced tokenization of free text).

---

## Locked rules (do not re-litigate)

1. Committed content stores **opaque tokens only** — never handle / reserved label / persona / profile strings for the mention.
2. Tokens must exist in final `content` **before** `contentCommitment({ id: txId, salt, content })` and envelope sign.
3. Client never re-derives privacy on read — chips use server `mentions[nodeId].{ display, kind, route?, isSelf }`.
4. Reserved / Someone chips are **non-link** (`route` absent). Persona/profile chips use server `route` (`/persona/…` or `/profile/…`).
5. Typeahead must not leak existence of fully anonymous accounts — prefer **thread roster** (in-thread personas) + **already-public handles** (ask if product wants a narrower/wider set).
6. Empty `@` ignored; compose may split `@` at the next non-handle character.
7. `body: string[]` stays paragraph-split; tokens remain inside paragraph strings; rendering scans for `<@…>` and swaps to chips.

---

## Deliverables

### A. SDK write path (embed before hash)

| Layer | Work |
|-------|------|
| [`CivicHttpClient.append`](../../identity/src/client/civic-http-client.ts) (and convenience `createPost` / `createComment` / etc.) | Accept optional `mentions?: MentionCandidate[]` (via `CivicAppendOptions` or equivalent). Flow: prepare(intent, mentions) → **rewrite** `intent.content` string fields replacing compose placeholders / candidate spans with `buildMentionToken(nodeId)` (order = `mentionNodes`) → `buildSigned` / `buildQuickSigned` on the **token-bearing** content. |
| Tests | Identity or api-level: prepare+append with mentions produces committed content containing `<@…>`; hash verifies; no tokens when mentions omitted. |

**Hard requirement:** do not sign content that still contains compose placeholders or `@handle` intended as mentions. Ask if placeholder representation in compose (chip object vs `@handle` text vs internal sentinel) is unclear before wiring.

Suggested embed helper home: shared util next to encode (`buildMentionToken`) callable from identity and web-app — keep one implementation.

### B. web-app compose UX

| Layer | Work |
|-------|------|
| Compose surfaces | Root compose ([`ComposeFlow.tsx`](../../web-app/src/components/chrome/ComposeFlow.tsx)) + reply composer ([`ReplyComposer.tsx`](../../web-app/src/components/content/ReplyComposer.tsx) / PostView reply path). Typeahead on `@` → candidate `{ kind: "persona", personaName }` or `{ kind: "profile", userId/handle }`. |
| [`web-app/src/lib/api/civic.ts`](../../web-app/src/lib/api/civic.ts) | Thread candidates through `civicComment` / root create helpers into SDK append. Today `civicComment` only passes `{ body }` — extend to carry mentions. |
| State / AppProvider | Wherever compose submit is orchestrated ([`AppProvider.tsx`](../../web-app/src/lib/state/AppProvider.tsx) calls `civicComment`) — collect mention candidates from the editor, not by re-parsing free text after the fact unless that is the chosen model (ask). |

Typeahead sources (MVP suggestion — confirm with user if ambiguous):

- **Persona:** names already visible in the open thread (comment authors / roster).
- **Profile:** handles the commenter may already see as public (or a thin lookup that 404s cleanly — must not reveal anonymous existence).

### C. web-app read render

| Layer | Work |
|-------|------|
| Types | Add optional `mentions?: Record<string, { display, kind, route?, isSelf }>` on [`FeedItem`](../../web-app/src/lib/types/records.ts), [`RecordDetail`](../../web-app/src/lib/types/records.ts), [`CommentNode`](../../web-app/src/lib/types/comments.ts). Mirror API `ResolvedMention`. |
| [`map.ts`](../../web-app/src/lib/api/map.ts) | Pass through `mentions` from feed/detail/comment DTOs (today stubs `mentions: []` only on profile/persona pages — those stay Slice 4). |
| Render | Token→chip in [`CommentThread.tsx`](../../web-app/src/components/content/CommentThread.tsx), [`FeedCard.tsx`](../../web-app/src/components/content/FeedCard.tsx), and detail title/body if shown as raw text elsewhere (`ShareCard` if it surfaces body). Use `parseMentionTokens` from `@oursay/encode`; look up metadata; fallback: if token present but missing from map, show a neutral chip or leave raw token (prefer neutral “Someone”-style; ask if unclear). |
| Titles | Post/petition titles and poll questions may contain tokens — chip-render those string fields too when present. |

Keep mock/corpus paths working: no `mentions` map ⇒ render plain text (including literal `@handle`).

### D. Tests

- Unit: embed helper maps candidates → tokens in title/body/text/question.
- Unit: chip renderer splits text + tokens; reserved non-link; profile/persona link to `route`.
- Integration (web-app and/or identity): compose path with one related + one unresolved mention; committed content has tokens; read map shows chips.
- Regression: plain `@alice` comment still posts; no `mentions` on DTO; no index (server already covered in Slice 2).

---

## Key file map

| Area | Path |
|------|------|
| Contract | `docs/entities/civic-identity/mention-node.md` |
| Token codec | `encode/src/mention-token.ts` (`buildMentionToken`, `parseMentionTokens`) |
| Prepare types | `identity/src/shared/types.ts` (`MentionCandidate`, `MentionNodeRef`, `PreparedAppend`) |
| SDK append | `identity/src/client/civic-http-client.ts`, `identity/src/client/session.ts` (`contentCommitment` site — do not change hash semantics) |
| Web civic API | `web-app/src/lib/api/civic.ts` |
| Compose UI | `web-app/src/components/chrome/ComposeFlow.tsx`, `web-app/src/components/content/ReplyComposer.tsx` |
| Submit orchestration | `web-app/src/lib/state/AppProvider.tsx` |
| DTO map | `web-app/src/lib/api/map.ts` |
| Types | `web-app/src/lib/types/records.ts`, `web-app/src/lib/types/comments.ts` |
| Read chips | `web-app/src/components/content/CommentThread.tsx`, `FeedCard.tsx` (+ detail title if needed) |
| Server metadata (reference only) | `api/src/services/identity-read.service.ts` (`ResolvedMention`), feed/detail services |

---

## Suggested implementation order

1. SDK: `append` options + embed-after-prepare helper + tests (manual embed already proven in `api/test/37-mention-nodes.spec.ts`).  
2. Types + `map.ts` passthrough for `mentions`.  
3. Chip renderer helper + wire into CommentThread / FeedCard / titles.  
4. Compose typeahead + candidate collection; thread through `civic.ts` → SDK.  
5. Run package tests; propose commit message(s) — **do not commit** unless asked.

---

## Success criteria

- Composing a related `@` produces `<@base59(nodeId)>` in committed title/body/text/question; envelope verifies.
- Unauthorized/unknown compose `@` still embeds a token; read shows **Someone** (non-link).
- Related soft-mode shows reserved label chip (non-link); after join, same token shows persona/profile per server metadata without rewriting content.
- Feed/detail/comment UI renders chips from server `mentions`; records without tokens unchanged.
- Plain-text `@handle` (no compose mention) still appends and is not tokenized/indexed.
- `contentCommitment` / signing unchanged aside from content bytes now containing tokens when mentions were composed.

---

## Risks / watch-outs

- **Embed layer:** if embed is only in web-app and someone calls `prepare`+`buildSigned` directly, tokens can be missed — prefer embedding inside `CivicHttpClient.append` so all callers get it.
- **Placeholder ↔ nodeId alignment:** `mentionNodes` order must match the candidates array sent to prepare; do not rely on handle string replace after the fact if handles collide.
- **Length caps:** tokens ~20+ chars; surface remaining body budget in compose when possible.
- **Typeahead privacy:** do not probe arbitrary handles in a way that distinguishes “exists but anonymous” from “unknown” beyond existing public profile 404 semantics.
- **New-thread compose:** allocate key is prepare’s `rootEntityId` (usually `entityId === threadId` for root create) — already enforced server-side.
- **ReplyComposer `@handle` prefix** today is a UI convenience for max-depth flatten — decide whether that prefix becomes a real mention candidate or stays plain text (ask if unclear).
- **Mock mode:** chips/typeahead should degrade gracefully when civic client / live API unavailable.

---

## Test commands (PowerShell)

```powershell
cd C:\Projects\OurSay\oursay\encode; npm test
cd C:\Projects\OurSay\oursay\identity; npm test
cd C:\Projects\OurSay\oursay\api; npm test
cd C:\Projects\OurSay\oursay\web-app; npm test
```

---

## Coding-agent start prompt (copy-paste)

```
Implement Mention Nodes Slice 3: web-app compose embed before contentHash + read-side chips from server mentions metadata.

**No assumptions — ask when compose UX, typeahead privacy scope, or embed-layer placement are ambiguous.**

## Read first
- docs/temp/MENTION-NODES-SLICE3-HANDOFF.md (this handoff)
- docs/entities/civic-identity/mention-node.md (authoritative)
- docs/temp/MENTION-NODES-SLICE2-HANDOFF.md (prior slice — API already done)
- encode/src/mention-token.ts
- identity/src/shared/types.ts (MentionCandidate / PreparedAppend.mentionNodes)
- identity/src/client/civic-http-client.ts (prepare accepts mentions; append does not yet embed)
- web-app/src/lib/api/civic.ts, map.ts
- web-app/src/components/content/CommentThread.tsx, FeedCard.tsx, ReplyComposer.tsx
- web-app/src/components/chrome/ComposeFlow.tsx

## Goals
1. SDK append: pass mentions to prepare, embed <@base59(nodeId)> into content string fields before buildSigned/contentHash.
2. web-app types + map.ts carry optional mentions metadata from feed/detail/comments.
3. Token→chip rendering (server display/kind/route; reserved/Someone non-link).
4. Compose @ typeahead → MentionCandidate[]; thread through civic.ts → SDK.
5. Tests for embed, chips, and plain-@handle passthrough.

## Out of scope
Mentions tabs / DEFERRED_MENTIONS (Slice 4), official always-public mention, content-warning filters.

## Before you finish
Run the PowerShell test commands in the handoff. Propose commit message(s); do not commit unless asked.
```
