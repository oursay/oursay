# User

## Definition

A registered account holder on OurSay. Public-facing identity (handle, display name) lives on this object; private PII lives on [Profile](./profile.md). Users exist on a spectrum from unverified participants to verified tiers and (future) officials.

## Aliases

| Layer | Name |
|-------|------|
| Product | User / account / participant |
| Code | `User`, `public.users` |
| Roles | Guest (no row), Unverified User, verified tiers, Administrator |

See [01-CONTRIBUTOR-SPEC.md §4](../../01-CONTRIBUTOR-SPEC.md).

## Identity

Two users are the same if their `id` (UUID) matches. Primary key: `public.users.id` — caller-supplied at registration.

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `id` | UUID | yes | no* | Primary key |
| `handle` | TEXT | no | yes | Unique `@username` when set |
| `display_name` | TEXT | no | yes | Public display; defaults to handle without `@` |
| `created_at` | TIMESTAMPTZ | yes | no | Account creation |

\* User id is not publicly surfaced; handle/display_name are the public identity.

### Derived (not stored on user row)

| Concept | Source |
|---------|--------|
| Verification tier | Latest [Verification](./verification.md) attestation |
| District membership | Inferred via [ProfileGeocode](./profile-geocode.md) |
| Role (Guest/Unverified/Admin) | Session + tier + admin flag (future) |

## States & lifecycle

```
[Guest — no account]
        │ register
        ▼
[Unverified User — account, no KYC]
        │ verify (see Verification)
        ▼
[identity_verified | residency_verified | official_verified | electoral_validated]
```

Additional account states from contributor §5.4: `pending`, `failed`, `sponsored_pending`, `verification_not_completed`.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| Profile | 1:1 | Private PII in `auth.profiles` |
| Verification | 1:N | Append-only attestations; latest wins |
| Session | 1:N | Active login sessions |
| PasskeyCredential | 1:N | Account-login passkeys |
| ThreadPersona | 1:N | One per thread joined |
| Civic content | 1:N | Via signed record transactions |

## Invariants

- District is **never stored** on the user row ([GLOSSARY.md](../../GLOSSARY.md)).
- User may belong to **multiple jurisdictions** via a jurisdiction-membership table; every account is auto-subscribed to **`oursay-global`** at registration. Future: geocode-suggested subscription prompts. (Membership table is target — see Gaps.)
- Administrators cannot alter vote counts, verification statuses, or ledger records (contributor §4.7).
- Account privacy model ([09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md)) is DESIGN TODO — not shipped.

## Permissions

| Action | Who |
|--------|-----|
| Create | Self via OTP registration |
| Read public profile | Anyone (handle, display_name) |
| Update public profile | Self (full session) |
| Delete | Platform policy (not fully specified) |

## Events

- Registration: creates `users` + `profiles` + best-effort geocode.
- Verification: appends `kyc_attestations` row.

## Examples

**Valid:** User with `handle: "@jane_alberta"`, `display_name: "Jane"`, no KYC → unverified tier, can act off-ledger.

**Invalid:** Storing `district_id` or `verification_tier` on `public.users` — tier comes from attestations; district is inferred.

## Implementation

| Layer | Path |
|-------|------|
| DDL | `public-record/src/schema/postgres.sql.ts` → `users` |
| Repo | `api/src/repo/user.repo.ts` |
| Registration | `api/src/services/registration.service.ts` |
| Routes | `api/src/http/routes/registration.routes.ts` |

## Gaps

- **[mvp-c10b-membership]**: No user ↔ jurisdiction subscription (membership table + auto `oursay-global`) — see [account/future.md](./future.md).
- Account visibility / per-jurisdiction privacy ([09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md)) not built — the reveal model replaces the old persona `claimed`/`claimed_at` flow.
