# ThreadPersona

## Definition

The stable pseudonymous public identity **Pₜ** for a user within one civic thread (a `post`, `petition`, or `poll` root). Appears as `authorPubkey` on every envelope that user writes in that thread — identical across all their devices. One persona per `(user, thread)`; first device wins at join.

Whether a viewer sees the persona or the real identity is the author's **effective visibility** (`thread ?? account ?? anonymous`, [09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md)) — the per-thread setting is chosen at compose/reply time and may narrow **or widen** the account default. *Retroactively* changing a past thread's visibility is the **reveal** flow (replacing the old `claimed`/`claimed_at` columns): a **platform reveal** is reversible (off-ledger), while an **on-chain reveal** is nuclear (permanent). See [civic-identity/future.md](./future.md).

## Aliases

| Layer | Name |
|-------|------|
| Product | Thread key / thread persona / pseudonym |
| Code | `ThreadKey`, Pₜ, `thread_keys` |
| Envelope field | `authorPubkey` |

See [08-IDENTITY-AND-DEVICE-POLICY.md](../../08-IDENTITY-AND-DEVICE-POLICY.md) §2–3.

## Identity

Primary key: `thread_keys.id` (UUID). Uniqueness enforced on `(user_id, thread_id)` and `pubkey` (hex, compressed P-256).

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `id` | UUID | yes | no | Internal id |
| `user_id` | UUID | yes | no | FK → `users.id` |
| `thread_id` | TEXT | yes | yes | Root entity id (post/petition/poll) |
| `jurisdiction` | TEXT | yes | yes | Partition key |
| `pubkey` | TEXT | yes | yes | Pₜ hex — public author on record |
| `persona_name` | TEXT | yes (target) | yes | **Globally-unique persona display name** (e.g. `BraveOtter42`), minted deterministically from Pₜ at join with collision retry. What product surfaces show for an unrevealed author; doubles as the persona-page route key |
| ~~`claimed`~~ | BOOLEAN | — | — | **Deprecated** — superseded by the reveal model; column remains until migration |
| ~~`claimed_at`~~ | TIMESTAMPTZ | — | — | **Deprecated** — superseded by the reveal model; column remains until migration |

## States & lifecycle

```
[user joins thread]
        │ IdentityRegistry.joinThread
        ▼
[thread_keys row created — first-wins on (user, thread)]
        │
        ▼
[all devices share same Pₜ as authorPubkey]
        │ optional future (reveal flow)
        ▼
[reveal — links pseudonym to public profile; platform-reversible or on-chain-nuclear]
```

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| User | N:1 | Owner |
| ThreadBinding | 1:1 | Private platform binding to account |
| ThreadCredential | 1:N | Per-device signers for this persona |
| RecordTransaction | 1:N | All txs use this `authorPubkey` |
| JurisdictionMasterKey | N:1 | Derived from jurisdiction-scoped master |

## Invariants

- **R2 [Invariant]**: Every ledger entry signed by per-thread key ([REQUIREMENTS.md](../../../public-record/REQUIREMENTS.md)).
- **R3 [Invariant]**: Keys derived on-device from jurisdiction-scoped master via HKDF.
- **UNIQUE(user_id, thread_id)**: First device wins Pₜ at DB level.
- Per-thread pubkey reveals nothing about real-world identity (contributor §11.2).
- Platform never holds private keys ([08-IDENTITY-AND-DEVICE-POLICY.md](../../08-IDENTITY-AND-DEVICE-POLICY.md)).

## Persona surface (public read)

The persona is a first-class public surface — the **anonymous mirror of a profile**, strictly
scoped to its one thread:

- **Persona page** (`GET /v1/public/personas/{persona_name}`; web-app `/persona/<name>`): the
  persona name, verification-tier pill (a civic signal, not identity), a thread-scoped support
  bar, and the persona's comments, activity, and mentions **within that thread only**.
- **Nothing derivable cross-thread**: the page must expose no signal linking this persona to the
  same human's other personas or profile. Identity lookups from a persona follow the anonymity
  patterns of [09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md) — out-of-scope →
  **404**.
- `persona_name` is globally unique so the page resolves from the name alone; names are minted at
  join (deterministic from Pₜ, retry on collision) and never re-randomized.

## Permissions

| Action | Who |
|--------|-----|
| Create (join) | Authenticated user on first civic action in thread |
| Read pubkey / persona_name / persona page | Public |
| Reveal | Self (future) |

## Events

- Join thread: creates `thread_keys` + `thread_bindings` + first `thread_civic_credentials`.
- Civic write: envelope carries Pₜ as `authorPubkey`.

## Examples

**Valid:** User joins poll thread on phone → Pₜ created; later joins same thread on laptop → same Pₜ, new device signer credential.

**Invalid:** Two different Pₜ values for same `(user_id, thread_id)` — DB constraint prevents.

## Implementation

| Layer | Path |
|-------|------|
| DDL | `public-record/src/schema/postgres.sql.ts` → `thread_keys` |
| Repo | `api/src/repo/civic-device.repo.ts` |
| Join flow | `api/src/services/civic-record.service.ts` |
| Types | `identity/src/shared/types.ts` → `ThreadRegistration` |

## Gaps

- **`persona_name` not in schema** — the display-name column (unique, minted at join) and the public persona read surface are target — `[align-w3-gates-schema]` / `[align-w4-api-surface]`. The web-app demos the naming + page client-side (`web-app/src/lib/read-model/persona.ts`).
- **Per-thread visibility override not in schema** — target `thread_bindings.visibility` (chosen at compose/reply; may widen or narrow the account default) — see [09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md) §4.
- **Reveal model not implemented** — retroactively changing a past thread's visibility (platform-reversible vs on-chain-nuclear), replacing the old `claimed`/`claimed_at` columns, which remain in `thread_keys` until migration. Tracked as `[code-drop-claimed-columns]`; see [civic-identity/future.md](./future.md). <!-- see .agents/CODE-ALIGNMENT-PROMPTS.md -->
