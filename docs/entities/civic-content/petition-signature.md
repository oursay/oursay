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
| `signScheme` | `"webauthn-es256"` | yes | yes | Required |
| `nullifier` | TEXT | yes | yes | Dedupe |
| `parent_id` | UUID | yes | yes | Petition entity id |

Action record also includes (product spec §9): geographic area at time of action, verification tier at time of action, anonymity flag — **snapshot gap** for geo/tier at action time.

## States & lifecycle

```
[create signature — FINAL by default]
    │ if allowRevoke + before deadline
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

- **R1a**: Signed FINAL by default; revoke only when entity rules + deadline allow.
- **MUST** use `webauthn-es256` ([jurisdiction.ts](../../../public-record/src/jurisdiction.ts)).
- Verified signatures on-ledger.
- Optional comment hidden when signing anonymously (contributor §8.2).

## Permissions

| Action | Who |
|--------|-----|
| Create (sign) | Any registered user |
| Delete (revoke) | Signer, if `allowRevoke` + before deadline |

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
