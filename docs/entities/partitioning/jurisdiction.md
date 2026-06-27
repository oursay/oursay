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
