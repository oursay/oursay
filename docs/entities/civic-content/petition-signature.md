# PetitionSignature

## Definition

A first-class signed commitment on a [Petition](./petition.md). Functionally equivalent to agreeing with formal intent — carries the same recording and anonymity rules as other civic actions, with optional signer comment.

## Aliases

| Layer | Name |
|-------|------|
| Product | Signature / signing a petition |
| Record type | `petition_signature` |
| Parent | `petition` |

See [01-CONTRIBUTOR-SPEC.md §9.2](../../01-CONTRIBUTOR-SPEC.md).

## Identity

- Entity: `entity_id` on signature transaction.
- Uniqueness: one active signature per `(author, petition)` via [Nullifier](../civic-identity/nullifier.md).

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `comment` | string | no | conditional | Hidden if anonymous |
| `authorPubkey` | TEXT | yes | yes | Pₜ |
| `signerPubkey` | TEXT | yes | yes | Device passkey |
| `signScheme` | `SignScheme` | yes | yes | Per jurisdiction+entity gate (AB: `webauthn-es256` for posts, petitions, votes & petition_signatures; Global: `p256` quick-sign accepted for all) |
| `nullifier` | TEXT | yes | yes | Dedupe |
| `parent_id` | UUID | yes | yes | Petition entity id |

Action record also includes (product spec §9): geographic area at time of action, verification tier at time of action, anonymity flag — **snapshot gap** for geo/tier at action time.

## States & lifecycle

```
[create signature — changeable by default; final where the jurisdiction tightens (AB)]
    │ if allowChange + before deadline
    ▼
[delete op = revoke]
```

Allowed ops: `create`, `delete` (delete = revoke, governance-gated).

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| Petition | N:1 | Parent |
| Nullifier | 1:1 | One per user per petition |
| ThreadPersona | N:1 | Author |

## Invariants

- **R1a (jurisdiction-config finality)**: changeable by default at the platform layer (loose defaults are intentional); a jurisdiction/entity tightens to final (`ab-ca-gov`: `allowChange: false`); revoke only when `allowChange` + deadline allow.
- Signed with at least the jurisdiction's `gates.petition_signature.signMin` method — effective method is the stronger of the account preference and the jurisdiction floor ([jurisdiction.md](../partitioning/jurisdiction.md)). `ab-ca-gov` floors signatures at passkey (`webauthn-es256`, UV); `oursay-global` accepts quick-sign (`p256`).
- **Sign now, verify later**: anyone the act gate admits may sign; the signature is included in the **platform count** only while the signer meets `gates.petition_signature.platformCount` (AB: jurisdiction residency; Global: `{identity_verified, residency_verified}`), recomputed at read time. This is a **counting floor, not a barrier** — below-floor signatures sit in the unverified counts until the signer verifies.
- **AB: official-role holders may not sign petitions** — denied at the act gate (submit rejected). Media mark / media-accredited status does not change this rule.
- Verified signatures on-ledger.
- Optional comment hidden when signing anonymously (contributor §8.2).

## Permissions

| Action | Who |
|--------|-----|
| Create (sign) | Any registered user (AB: official-role holders denied) |
| Delete (revoke) | Signer, if `allowChange` + before deadline |

## Events

- Sign → `record_tx` + outbox (verified).
- Revoke → delete transaction.

## Examples

**Valid:** Residency-verified user signs anonymously with comment "I support this" — comment hidden publicly, tier shown.

**Invalid:** Second signature on same petition by same user — nullifier rejection.

## Implementation

| Layer | Path |
|-------|------|
| ALLOWED_OPS | `create`, `delete` only |
| Views | `active_signatures`, `petition_signature_counts` |
| Write | Civic prepare/submit |

## Gaps

- **[mvp-c4-action-snapshots]**: Geo/tier at action time not stored — counts use current values.
