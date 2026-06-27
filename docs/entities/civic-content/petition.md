# Petition

## Definition

A formal call to action that collects signatures, addressed to a specific authority. Escalates formality from [Belief](./belief.md) in the content hierarchy.

## Aliases

| Layer | Name |
|-------|------|
| Product | Petition |
| Record type | `petition` |
| Signatures | `petition_signature` (separate entity) |

See [01-CONTRIBUTOR-SPEC.md §8.2](../../01-CONTRIBUTOR-SPEC.md).

## Identity

Primary key: `entity_id` (UUID) on root `petition` create transaction.

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `title` | string | yes | yes | Content JSON |
| `text` | string | yes | yes | Full petition body |
| `rules` | EntityRules | no | yes | See [EntityRules](../partitioning/entity-rules.md) |
| `authorPubkey` | TEXT | yes | yes | May be anonymous |
| `addressed to` | profile ref | no | yes | Official profile link |
| `links to beliefs` | UUID[] | no | yes | Optional many |
| `links to public votes` | UUID[] | no | yes | Optional many |

### Product status (not separate record type today)

| Status | Meaning |
|--------|---------|
| `open` | Accepting signatures |
| `closed` | No longer accepting |
| `delivered` | Marked delivered to official |
| `responded` | Official response received |

Status is product-layer metadata — may be derived from rules/deadline/admin action.

### Derived counts

Signature count (total \| by tier) — policy-gated on list/detail; filterable on `/counts`.

## States & lifecycle

```
[create petition — open]
    │ signatures collected
    │ deadline (if set)
    ▼
[closed]
    │ admin marks delivered
    ▼
[delivered → official notified]
    ▼
[responded]
```

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| PetitionSignature | 1:N | First-class signed commitments |
| Belief | N:M | Optional upstream links |
| PublicVote | N:M | Optional downstream links |
| Comment | 1:N | Discussion thread |
| EntityRules | 1:1 | Embedded in create content |

## Invariants

- **R1a**: Signatures final by default; revoke only if `allowRevoke` + before deadline.
- `petition_signature` MUST use `webauthn-es256`.
- Verified signatures on-ledger; unverified off-ledger.
- Delivery to official with platform account triggers notification (contributor §8.2).

## Permissions

| Action | Who |
|--------|-----|
| Create | Any registered user |
| Sign | Any registered user |
| Revoke signature | Signer, if rules permit |
| Update | Author / platform governance |
| Mark delivered | Administrator |

## Events

- Signature create → outbox (verified).
- Delivery → notification to addressed official(s).

## Examples

**Valid:** Petition to MLA with `{ allowRevoke: false }` — signatures permanent once cast.

**Invalid:** Revoking signature when `allowRevoke` is false — rejected at submit.
<!-- We should consider adding revocation attempts on chain even if rejected by the platform in vote counting. -->

## Implementation

| Layer | Path |
|-------|------|
| Content shape | `{ title, text, rules? }` in types.ts |
| Read | `GET /v1/public/petitions`, `/:id`, `/:id/counts` |
| Signatures view | `active_signatures`, `petition_signature_counts` |

## Gaps

- Product status workflow (delivered/responded) not fully automated in API.
- `official_response` record type is future ([REQUIREMENTS.md](../../../public-record/REQUIREMENTS.md) R1).
