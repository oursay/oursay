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

### gates (per-action policy, target)

The per-action gate map — **the** jurisdiction policy seam for who may act, how actions must be
signed, and who counts officially. Replaces the earlier `signing.defaultScheme` knob, the
platform-wide vote/signature scheme hard-override, and the `graduation.createTier` / `actTier`
sketches. **Target — not yet present in code** (`[align-w3-gates-schema]`).

```ts
type GateActor =
  | "anyone"                         // any registered account
  | { tiers: KycTier[] }             // KYC tier set membership
  | { residencyIn: "jurisdiction" }  // residency_verified AND point ∈ jurisdiction region
  | { role: "official" };            // platform-assigned role, not a tier

interface ActionGate {
  act: GateActor;                    // who may perform the action at all
  signMin: "quick" | "passkey";      // minimum sign method; account pref may raise, never lower
  official?: GateActor;              // who counts in official totals (absent ⇒ same as act)
}

interface JurisdictionGates {
  post: ActionGate; petition: ActionGate; poll: ActionGate;   // creation
  comment: ActionGate; reaction: ActionGate;                  // attachments
  vote: ActionGate; petition_signature: ActionGate;           // singletons
}
```

Launch configs:

| Gate | `oursay-global` | `ab-ca-gov` |
|---|---|---|
| `post` (create) | anyone · quick | anyone · **passkey (uv)** |
| `petition` (create) | anyone · quick | residency-verified · passkey |
| `poll` (create) | anyone · quick | **role: official** · passkey (or petition→poll graduation) |
| `comment` / `reaction` | anyone · quick | anyone · quick |
| `vote` | act: anyone · quick · official `{identity_verified, residency_verified}` | act: **jurisdiction residency** · passkey |
| `petition_signature` | act: anyone · quick · official `{identity_verified, residency_verified}` | act: anyone (**sign now, verify later**) · passkey · official: **jurisdiction residency** |

Notes: **jurisdiction residency** = `residency_verified` AND geocoded point inside the
jurisdiction's region (a gate kind, not a tier). Official gates are recomputed at read time from
current attestations. `counts.minTier` (public count *exposure*) must stay consistent with
`official` — for `ab-ca-gov` that means dropping `identity_verified` from `minTier` (config change
tracked in `[align-w3-gates-schema]`).

### graduation (promotion policy, target)

| Field | Type | Meaning |
|-------|------|---------|
| `graduation.policy` | `open` \| `ladder` | `open`: any member may create a root at any level directly. `ladder`: higher levels via graduation (creation gates above still apply). |
| `graduation.petitionToPoll` | `{ threshold: number, deadlineSource: "duration" \| "explicit" }` | Verified-signature count that auto-graduates a linked petition into a poll, and how the poll's deadline is set. |

Reference models: `oursay-global` = `policy: open`; `ab-ca-gov` = `policy: ladder` (polls also
creatable directly by officials via `gates.poll`); `some-strict` = `policy: ladder` for every
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
- Every action is signed with at least the jurisdiction's `gates[action].signMin`; the account's signing preference may raise but never lower the floor (strongest wins). *(History: an earlier platform-wide `webauthn-es256` hard-require for `vote`/`petition_signature` is superseded by these per-jurisdiction gates; code still enforces the old rule — `[align-w3-gates-schema]`.)*
- Count exposure policy is a layer above geo/tier filtering ([06-PRIVACY-REVIEW.md](../../06-PRIVACY-REVIEW.md) §2).

## Permissions

- **Read:** Public via `GET /v1/public/jurisdictions` (catalog).
- **Write:** Platform configuration only; not user-editable.

## Events

- Registration at startup: `registerJurisdiction()` in API composition root.
- Settlement worker drains outbox per `chain_id`.

## Examples

**Valid:** `{ id: "ab-ca-gov", level: "provincial", label: "Alberta", rules: { allowChange: false, allowRevoke: false }, counts: { votes: true, signatures: true, minTier: ["residency_verified"] }, gates: { post: { act: "anyone", signMin: "passkey" }, vote: { act: { residencyIn: "jurisdiction" }, signMin: "passkey" }, petition_signature: { act: "anyone", signMin: "passkey", official: { residencyIn: "jurisdiction" } }, poll: { act: { role: "official" }, signMin: "passkey" }, comment: { act: "anyone", signMin: "quick" }, reaction: { act: "anyone", signMin: "quick" }, petition: { act: { tiers: ["residency_verified"] }, signMin: "passkey" } } }`

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
- **[align-w3-gates-schema]** (absorbs `[code-jurisdiction-graduation]` + `[code-participation-act-eligibility]`): the `gates` per-action map (act / signMin / official, incl. the jurisdiction-residency and official-role gate kinds), the `graduation` policy fields, and the removal of the `requiredSignScheme()` hard override are **target only** — `JurisdictionConfig` has none of them today, and no auto-graduation worker exists. See `.agents/WEB-APP-ALIGNMENT-PROMPTS.md`.
- **Official role** — the `role: "official"` gate needs a platform-assigned, revocable role on the user/jurisdiction membership (a **role, not a KYC tier**); no such column/flow exists yet.
- **[code-jurisdiction-binding-fallback]**: every root entity carries `jurisdictionId` in its audience, but the explicit **`oursay-global` fallback on create** (and its enforcement that no root is unbound) is not yet asserted in code.
