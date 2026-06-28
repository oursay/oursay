# Jurisdiction

## Definition

The primary partition of civic identity and rules. A jurisdiction (e.g. `ab-ca-gov`, `ca-gov`) is **one chain + one rule set + one governmental level**, and is **1:1 with an append-only ledger chain**. Users may belong to multiple jurisdictions; cryptographic identity and gating rules are partitioned per jurisdiction.

## Aliases

| Layer | Name |
|-------|------|
| Product | Jurisdiction |
| Code | `JurisdictionConfig`, `jurisdictionId` |
| Ledger | `chainId` (e.g. `record_outbox.chain_id`) |

**Level** is a *property* of a jurisdiction (`federal`, `provincial`, `municipal`), never a partition key on its own. See [GLOSSARY.md](../../GLOSSARY.md).

## Identity

Two jurisdictions are the same if their `id` strings match. Primary key: `id` (in-memory registry; realized as `chain_id` at the ledger boundary).

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `id` | string | yes | yes | `JurisdictionConfig.id` |
| `level` | string | yes | yes | `JurisdictionConfig.level` |
| `label` | string | no | yes | Display name (e.g. "Alberta"); catalog only |
| `rules` | `JurisdictionRules` | yes | partial | Default gating + signing policy |
| `privacy.kAnonymityFloor` | number | no | no | Minimum aggregation floor for counts |
| `counts.votes` | boolean | yes | yes | Whether poll tallies are exposable |
| `counts.signatures` | boolean | yes | yes | Whether petition scalars are exposable |
| `counts.minTier` | string[] | no | yes | Tier-gated exposure subset |
| `labels` | map | no | yes | **Target** — user-facing labels per record type; see below |
| `contentLimits` | map | no | yes | **Target** — hard content caps per type; see below |

### labels (user-facing display, target)

Per-jurisdiction display labels for the canonical record types. Display only — never a partition key or dev term.

| Key | Default | Alberta (`ab-ca-gov`) |
|-----|---------|-----------------------|
| `post` | Statement | Statement |
| `petition` | Petition | Petition |
| `poll` | Poll | Poll |
| `result` | Result | Result |
| `district` | District | riding |

`oursay-global` uses all defaults.

### contentLimits (hard caps, target)

Per-type maximum sizes enforced at create/update. Alberta example:

| Type | Caps |
|------|------|
| `post` | title 200, body 2000 |
| `comment` | body 2000 |
| `petition` | title 200, text 5000 |
| `poll` | question 200, option 100, max 10 options, description 2000 |

### JurisdictionRules (defaults)

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `allowChange` | boolean | false | Votes may change before deadline |
| `allowRevoke` | boolean | false | Signatures may be revoked before deadline |
| `defaultDeadline` | ISO 8601 | — | Default close time when entity sets none |
| `signing.defaultScheme` | `SignScheme` | — | Default signing scheme for non-forced types |

### graduation (promotion policy, target)

Per-jurisdiction control over the content ladder (`post → petition → poll → result`; see
[01-CONTRIBUTOR-SPEC.md §8.6](../../01-CONTRIBUTOR-SPEC.md)). **Target — not yet present in code.**

| Field | Type | Meaning |
|-------|------|---------|
| `graduation.policy` | `open` \| `ladder` | `open`: any member may create a root at any level directly (no gate). `ladder`: higher levels are reached only by graduation. |
| `graduation.createTier` | map `record_type → tier set` | Minimum KYC tier set allowed to **create** each level (e.g. AB: `post` → any registered; `petition` → residency-verified). |
| `actTier` (participation) | map `action → tier set` | **Who may *act*** on participation — `vote` / `petition_signature` / `comment` / `reaction` (distinct from *who counts officially*, which is `appliesToVerified`). Today only creation has a gate; this generalizes it. Target — see `[code-participation-act-eligibility]`. |
| `graduation.petitionToPoll` | `{ threshold: number, deadlineSource: "duration" \| "explicit" }` | Verified-signature count that auto-graduates a linked petition into a poll, and how the poll's deadline is set. |

Reference models: `oursay-global` = `policy: open`; `ab-ca-gov` = `policy: ladder`, `post` open / `petition`
residency-verified, poll only via `petitionToPoll` graduation; `some-strict` = `policy: ladder` for every
level. Tracked in `.agents/CODE-ALIGNMENT-PROMPTS.md` → `[code-jurisdiction-graduation]`.

## States & lifecycle

Configuration object — no runtime state machine. Registered at API startup from `@oursay/jurisdiction-data` (`oursay-global`, `ab-ca-gov` today).

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| District | 1:N | Districts belong to a `jurisdiction_id` |
| User | N:M | Users may participate in multiple jurisdictions |
| Record chain | 1:1 | Each jurisdiction maps to one ledger `chain_id` |
| EntityRules | 1:N | Entity rules layer over jurisdiction defaults |

## Invariants

- Jurisdiction is the crypto/dedupe partition key, not level ([GLOSSARY](../../GLOSSARY.md)).
- **Every root entity** (`post` / `petition` / `poll`) is bound to **exactly one** jurisdiction via its thread audience `jurisdictionId`; comments, reactions, votes, and signatures inherit it from their root. There is no unbound civic content.
- **Fallback binding** — absent an explicit jurisdiction choice, a root entity is created in **`oursay-global`** (every account is auto-subscribed to it at registration). A jurisdiction is therefore never "none".
- `vote` and `petition_signature` MUST use `webauthn-es256` regardless of jurisdiction config (R2, signing policy).
- Count exposure policy is a layer above geo/tier filtering ([06-PRIVACY-REVIEW.md](../../06-PRIVACY-REVIEW.md) §2).

## Permissions

- **Read:** Public via `GET /v1/public/jurisdictions` (catalog).
- **Write:** Platform configuration only; not user-editable.

## Events

- Registration at startup: `registerJurisdiction()` in API composition root.
- Settlement worker drains outbox per `chain_id`.

## Examples

**Valid:** `{ id: "ab-ca-gov", level: "provincial", label: "Alberta", rules: { allowChange: false, allowRevoke: false }, counts: { votes: true, signatures: true, minTier: ["residency_verified"] } }`

**Invalid:** Using `level: "provincial"` as a partition key for signing keys or nullifier roots — level is metadata only.

## Implementation

| Layer | Path |
|-------|------|
| Config type | `public-record/src/jurisdiction.ts` |
| Registry | `registerJurisdiction()`, `getJurisdiction()` |
| Data | `@oursay/jurisdiction-data` workspace |
| Outbox tag | `record_outbox.chain_id` |

## Gaps

- **JurisdictionConfig shape drift** — code today is `{ id, level, label, rules, privacy?, counts? }` in `public-record/src/jurisdiction.ts`; `labels` (per-record-type user-facing labels) and `contentLimits` (hard caps per type) are **not yet** present. Tracked in `.agents/CODE-ALIGNMENT-PROMPTS.md` → `[code-jurisdiction-labels-limits]`. Note `label` (singular, the jurisdiction's own display name) is distinct from `labels` (the per-record-type map).
- **[mvp-c10-multi-jurisdiction]**: API container still uses a single deployment-default chain for some write paths; worker is already multi-chain ([API-GAPS-AND-ROADMAP.md](../../API-GAPS-AND-ROADMAP.md)).
- **[mvp-c10b-membership]**: No user ↔ jurisdiction subscription model yet — see [partitioning/future.md](./future.md).
- **[code-jurisdiction-graduation]**: `JurisdictionRules.graduation` (policy / create-tier gate / petition→poll threshold) is **target only**; `JurisdictionConfig` has no graduation fields and no auto-graduation worker today.
- **[code-participation-act-eligibility]**: *who may vote/sign/comment/react* is jurisdiction policy (PRD §5), but only **creation** is gated (`graduation.createTier`). A participation `actTier` map (distinct from `appliesToVerified` official-count gating) is **target only** — without it the public-vs-verified act decision cannot be encoded.
- **[code-jurisdiction-binding-fallback]**: every root entity carries `jurisdictionId` in its audience, but the explicit **`oursay-global` fallback on create** (and its enforcement that no root is unbound) is not yet asserted in code.
