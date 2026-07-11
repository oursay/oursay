# Petition

## Definition

A formal call to action that collects signatures, addressed to a specific authority. Escalates formality from [Statement](./post.md) in the content hierarchy.

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
| `text` | string | yes | yes | Full petition body; may embed opaque mention tokens — see [mention-node.md](../civic-identity/mention-node.md) |
| `rules` | EntityRules | no | yes | See [EntityRules](../partitioning/entity-rules.md) |
| `authorPubkey` | TEXT | yes | yes | May be anonymous |
| `addressedTo` | recipient ref(s) | no | yes | Inferred by default; see below |
| `links to posts` | UUID[] | no | yes | Optional many |
| `links to polls` | UUID[] | no | yes | Optional many |

### addressedTo (recipient inference)

`addressedTo` is **inferred by default** from the petition's audience, with a platform/moderation override:

| Petition audience | Default recipient |
|-------------------|-------------------|
| District-scoped (`appliesToRegion` = riding/district) | The seated MLA(s) for those districts, as secondary recipients |
| Jurisdiction-wide | The legislature (Alberta: the Legislative Assembly) |
| Explicit **constitutional** checkbox | The relevant Minister / Lieutenant Governor |

Recipients are **institutional roles**, not profile-only: a legislature, minister, agency, office, ministry, or governing body. Platform/moderation may override the inferred recipient.

### Product status (not separate record type today)

| Status | Meaning |
|--------|---------|
| `open` | Accepting signatures |
| `closed` | No longer accepting |
| `delivered` | Marked delivered to official |
| `responded` | Official response received |

Status is product-layer metadata — may be derived from rules/deadline/admin action.

### Derived counts

Signature count (total \| by tier) — policy-gated on list/detail; filterable on `/counts`. The **platform count** applies `gates.petition_signature.platformCount` (AB: jurisdiction residency; Global: `{identity_verified, residency_verified}`), recomputed at read time. It is a **counting floor after the action, not a participation barrier** — anyone the act gate admits is welcome to sign; below-floor signatures are bunched into the unverified counts until the signer verifies to the required tier. A platform-signed **platform-count record** snapshots the eligible signatures and each signer's status ([record/future.md](../record/future.md)).

### Read-surface projections (target)

Detail/list DTOs additionally carry `signTier` (action signing tier), `editCount` (revision count),
`appliesToDistrictIds` (district-slug projection of the stake), and the viewer-resolved `authorGeo`
relation — see [entity-projection.md](../record/entity-projection.md).

## States & lifecycle

```
[create petition — open]
    │ signatures collected
    │ deadline (the ONLY closing)
    ▼
[closed]
    │ admin marks delivered
    ▼
[delivered → official notified]
    ▼
[responded]
```

**The deadline is the only closing.** Reaching the graduation/success threshold does **not** close a petition, and neither does a manual graduation: at the configured threshold the linked poll is **forced** (whether or not an official agrees), and in `ab-ca-gov` an official-role holder may **promote the petition into a poll early, at any point** — in both cases the **proposing user remains the poll's author** and the petition stays open for signatures until its deadline. See [jurisdiction.md](../partitioning/jurisdiction.md) graduation.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| PetitionSignature | 1:N | First-class signed commitments |
| Post | N:M | Optional upstream links |
| Poll | N:M | Optional downstream links |
| Comment | 1:N | Discussion thread |
| EntityRules | 1:1 | Embedded in create content |

## Invariants

- **R1a (jurisdiction-config finality)**: signatures are **changeable by default** at the platform layer (loose defaults are intentional); a jurisdiction tightens to final via its config — `ab-ca-gov`: `allowChange: false`; `oursay-global`: revocable before deadline.
- `petition_signature` is signed with at least the jurisdiction's `gates.petition_signature.signMin` (AB: passkey `webauthn-es256`; Global: quick-sign `p256` accepted) — see [petition-signature.md](./petition-signature.md).
- Verified signatures on-ledger; unverified off-ledger.
- Delivery to official with platform account triggers notification (contributor §8.2).

## Permissions

| Action | Who |
|--------|-----|
| Create | Per jurisdiction `gates.petition.act` — `oursay-global`: any registered user; `ab-ca-gov`: residency-verified |
| Sign | Any registered user (**sign now, verify later**; platform count per `gates.petition_signature.platformCount`). **AB: official-role holders denied** at the act gate |
| Revoke signature | Signer, if rules permit |
| Update | Author / platform governance |
| Mark delivered | Administrator |

## Events

- Signature create → outbox (verified).
- Delivery → notification to addressed official(s).

## Examples

**Valid:** Petition to MLA with `{ allowChange: false }` — signatures permanent once cast (a jurisdiction tightening; the platform default is changeable).

**Invalid:** Revoking signature when `allowChange` is false — rejected at submit.
<!-- We should consider adding revocation attempts on chain even if rejected by the platform in vote counting. -->

## Implementation

| Layer | Path |
|-------|------|
| Content shape | `{ title, text, rules? }` in types.ts |
| Read | `GET /v1/public/petitions`, `/:id`, `/:id/counts` |
| Signatures view | `active_signatures`, `petition_signature_counts` |

## Gaps

- **[proposed-petition-support-label] (PROPOSED — wireframe 2026-06-29)** — The mobile compose wireframe (`wireframes/mobile/app-frame.svg`) introduces a per-petition **support statement**: the customizable call-to-action label shown on the signature button, **defaulting to "Sign the Petition"**, capped at **60 chars**. This is a **new content field** on petition (suggested `supportLabel` / `signCta`) **not in the Attributes table above**. **Decision pending product/doc approval.** If approved: add the field to `PetitionContent` (`public-record/src/schema/types.ts`), add a `supportLabel` cap (≤60) to `JurisdictionConfig.contentLimits` + `DEFAULT_CONTENT_LIMITS`, enforce in `validateContent`, and surface it in the Attributes table. Flagged here for the doc/API teams.
- **Content-limit enforcement (RESOLVED 2026-06-27)** — `title` and `text` are **required** (non-empty) and capped (AB: title 200, text 5000) at create *and* update by `validateContent` (`public-record/src/schema/content.ts`) against the jurisdiction's `JurisdictionConfig.contentLimits` (falling back to `DEFAULT_CONTENT_LIMITS`); see the [jurisdiction.md](../partitioning/jurisdiction.md) contentLimits table. `rules` (EntityRules) is untouched. Completed alongside `post` ([code-post-content-fields]).
- Product status workflow (delivered/responded) not fully automated in API.
- `official_response` record type is future ([REQUIREMENTS.md](../../../public-record/REQUIREMENTS.md) R1).
