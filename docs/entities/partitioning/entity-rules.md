# EntityRules

## Definition

Per-entity governance rules attached to a **petition** or **public vote** at creation. Rules layer over jurisdiction defaults and govern geographic scope, deadlines, and whether votes may change or signatures may be revoked.

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

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `appliesToDistrictIds` | string[] | no | yes | District revision ids; absent/empty = whole jurisdiction |
| `deadline` | ISO 8601 | no | yes | After this instant, no change/revoke permitted |
| `allowChange` | boolean | no | yes | Poll: votes may change before deadline |
| `allowRevoke` | boolean | no | yes | Petition: signatures may be revoked /before deadline |

Defaults when absent: **final-action semantics** — votes cast and signatures signed are FINAL (real-world analog).

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
| PublicVote | 1:1 | Rules on `poll` create content |
| Jurisdiction | N:1 | Jurisdiction defaults via `resolveRules()` |
| Region | derived | `appliesToDistrictIds` → `impacted-region` GeoScope |

## Invariants

- **R1a [Invariant]**: Governance is per-entity; rules layer over jurisdiction defaults ([REQUIREMENTS.md](../../../public-record/REQUIREMENTS.md)).
- Vote is cast FINAL by default; signature is signed FINAL by default.
- Change/revoke permitted only when entity rules + deadline allow it.
- `appliesToDistrictIds` absent or empty ⇒ whole jurisdiction ([governance.ts](../../../public-record/src/governance.ts)).

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

- Per-jurisdiction choice of count-snapshot instant (creation vs resolution time) is future config ([REGION-MODEL.md](../../REGION-MODEL.md)).
