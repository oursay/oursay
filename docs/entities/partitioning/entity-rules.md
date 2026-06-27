# EntityRules

## Definition

Per-entity governance rules attached to a **petition** or **poll** at creation. Rules layer over jurisdiction defaults and govern the thread's **audience** (geographic + verification stake), deadlines, and whether votes may change or signatures may be revoked. Audience is declared on the **root entity** (`post` / `petition` / `poll`); votes, comments, and reactions inherit it.

## Aliases

| Layer | Name |
|-------|------|
| Product | Entity scope / governance rules |
| Code | `EntityRules` |
| Record | Embedded in `petition` / `poll` create content JSON |

See [GLOSSARY.md](../../GLOSSARY.md) "Entity scope (poll/petition)".

## Identity

Not a standalone row — rules are part of a petition or poll entity's content, identified by the parent entity's `entity_id`. Updates via platform-signed `update` transactions.

## Attributes

Target shape (see **Gaps** for current code drift):

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `jurisdictionId` | string | **yes** | yes | The partition the thread lives in (every thread has one) |
| `appliesToRegion` | RegionRef \| union | no | yes | Geographic stake — see below; absent = whole jurisdiction |
| `appliesToVerified` | tier set | no | yes | Minimum KYC tier set counting toward stake/official totals |
| `deadline` | ISO 8601 | no | yes | After this instant, no submit and no change/revoke permitted |
| `allowChange` | boolean | no | yes | Whether a singleton action may change before deadline (target: single unified flag) |

**`appliesToRegion`** is a geographic reference (or a union of them):

| Form | Meaning |
|------|---------|
| `jurisdiction` | The whole jurisdiction (also the absent default) |
| `district:<district_slug>` | A stable seat across boundary revisions — what stable district pages key off |
| `district:<revisionId>` | A specific boundary revision (e.g. `edmonton-strathcona-2019`) |
| `region:<presetId>` | A stored region preset |
| union of the above | And/Or/Not composition (not Xor) |

Defaults when absent: **final-action semantics** — votes cast and signatures signed are FINAL (real-world analog), whole-jurisdiction audience, no tier floor beyond the jurisdiction's.

> **Deadline gates both submit AND change/revoke.** Once the deadline passes, no new vote/signature may be submitted and none may be changed or revoked.
>
> **`allowChange` / `allowRevoke` unify.** Today there are two flags (`allowChange` for polls, `allowRevoke` for petitions); the target is a single `allowChange` field covering both change and revoke. See **Gaps**.

## States & lifecycle

Rules are set on entity `create` and may be updated by a **platform-signed** `update` transaction before close. No separate state machine.

```
[jurisdiction defaults]
        │ layered by
        ▼
[entity create sets EntityRules]
        │ optional
        ▼
[platform-signed update modifies rules]
        │
        ▼
[deadline passes → change/revoke locked]
```

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| Petition | 1:1 | Rules on `petition` create content |
| Poll | 1:1 | Rules on `poll` create content |
| Jurisdiction | N:1 | Jurisdiction defaults via `resolveRules()` |
| Region | derived | `appliesToRegion` → `impacted-region` GeoScope (today via `appliesToDistrictIds`) |

## Invariants

- **R1a [Invariant]**: Governance is per-entity; rules layer over jurisdiction defaults ([REQUIREMENTS.md](../../../public-record/REQUIREMENTS.md)).
- Vote is cast FINAL by default; signature is signed FINAL by default.
- Change/revoke permitted only when entity rules + deadline allow it.
- `appliesToRegion` absent ⇒ whole jurisdiction (today realized as `appliesToDistrictIds` absent/empty in [governance.ts](../../../public-record/src/governance.ts)).
- A thread's audience cannot be **widened** after creation (privacy/scope cannot leak outward).

## Permissions

- **Create:** Entity author sets initial rules on `create`.
- **Update:** Platform-signed governance updates only.
- **Read:** Public on entity detail.

## Events

- Count filtering: `impacted-region` scope compiles from `appliesToDistrictIds`.
- Governance gates enforced at civic write submit time.

## Examples

**Valid:** Petition with `{ allowRevoke: true, deadline: "2026-08-01T00:00:00Z" }` — signers may revoke until deadline.

**Invalid:** User revoking a signature when `allowRevoke` is false or after deadline — rejected at submit.

## Implementation

| Layer | Path |
|-------|------|
| Type | `public-record/src/schema/types.ts` → `EntityRules` |
| Resolution | `public-record/src/governance.ts` → `resolveRules()` |
| Jurisdiction defaults | `public-record/src/jurisdiction.ts` → `JurisdictionRules` |

## Gaps

- **Audience model drift** — code today exposes only `EntityRules.appliesToDistrictIds` (raw district-id array) plus `deadline` / `allowChange` / `allowRevoke` in `public-record/src/schema/types.ts`. Target adds `appliesToRegion` (RegionRef/union) and `appliesToVerified` (tier set), and unifies `allowChange`/`allowRevoke`. Tracked in `.agents/CODE-ALIGNMENT-PROMPTS.md` → `[code-applies-to-region]`, `[code-applies-to-verified]`.
- Per-jurisdiction choice of count-snapshot instant (creation vs resolution time) is future config ([REGION-MODEL.md](../../REGION-MODEL.md)).
- A materialized `entity_audience` projection for fast district-page listing is future — see [partitioning/future.md](./future.md).
