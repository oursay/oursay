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

**`appliesToRegion`** is a geographic reference — a [RegionRef](region.md) — or a union of them:

| Form | Meaning |
|------|---------|
| `"jurisdiction"` | The whole jurisdiction (also the absent default) |
| `"district:<district_slug>"` | A **stable seat** across boundary revisions (year-less key) — resolves to the revision in force at `asOf`; what stable district pages key off |
| `"revision:<revisionId>"` | A **pinned** boundary revision (e.g. `edmonton-strathcona-2019`) |
| `"region:<presetId>"` | A stored region preset |
| `{ op: "and" \| "or" \| "not", refs: [...] }` | And/Or/Not composition of the above (not Xor). `not` is bounded by the jurisdiction (`not(X) ≡ jurisdiction ∖ X`) |

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
| Region | derived | `appliesToRegion` → `impacted-region` GeoScope (compiled by `RegionResolver.resolveRegionRef`; the deprecated `appliesToDistrictIds` alias maps to an OR-of-revisions RegionRef) |

## Invariants

- **R1a [Invariant]**: Governance is per-entity; rules layer over jurisdiction defaults ([REQUIREMENTS.md](../../../public-record/REQUIREMENTS.md)).
- Vote is cast FINAL by default; signature is signed FINAL by default.
- Change/revoke permitted only when entity rules + deadline allow it.
- `appliesToRegion` absent ⇒ whole jurisdiction (a `null` stake on the public surface; the deprecated `appliesToDistrictIds` absent/empty resolves the same way via [governance.ts](../../../public-record/src/governance.ts)).
- A thread's audience cannot be **widened** after creation (privacy/scope cannot leak outward). Today this is upheld **structurally** — there is no public district-id query surface and every `appliesToRegion` resolves server-side to a `Region` — not by an active narrow-only diff check on governance updates (a geometric `newRegion ⊆ oldRegion` proof is deferred; see **Gaps**).

## Permissions

- **Create:** Entity author sets initial rules on `create`.
- **Update:** Platform-signed governance updates only.
- **Read:** Public on entity detail.

## Events

- Count filtering: `impacted-region` scope compiles from `appliesToRegion`.
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

- **History — audience model (`[code-applies-to-region]`, resolved):** `EntityRules.appliesToRegion` (a [RegionRef](region.md) / and-or-not union) landed and is the canonical geographic stake; `RegionResolver.resolveRegionRef` compiles it and the `impacted-region` GeoScope reads it. `appliesToDistrictIds` (the raw district-id array) remains a **deprecated alias**, mapped internally to an OR-of-revisions RegionRef. Still outstanding: `appliesToVerified` (tier set, `[code-applies-to-verified]`) and the `allowChange`/`allowRevoke` unification.
- **Narrow-only enforcement (deferred):** the "audience may narrow, never widen" invariant is upheld structurally (no public district-id query surface; refs resolve server-side), but there is **no active gate** proving `newRegion ⊆ oldRegion` on platform-signed governance `update`s. That geometric containment check (effective-dated old/new resolution + `ST_Covers`) is a separate task.
- Per-jurisdiction choice of count-snapshot instant (creation vs resolution time) is future config ([REGION-MODEL.md](../../REGION-MODEL.md)).
- A materialized `entity_audience` projection for fast district-page listing is future — see [partitioning/future.md](./future.md).
