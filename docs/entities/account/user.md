# User

## Definition

A registered account holder on OurSay. Public-facing identity (handle, display name) lives on this object; account-private contact/prefs live on [Profile](./profile.md). **Legal name and residential address are not OurSay fields** — they stay with the KYC provider. Users exist on a spectrum from unverified participants to verified tiers and (future) officials.

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
| `handle` | TEXT | **yes** | scoped | Unique `@username`, collected at registration (NOT NULL target; nullable today — see Gaps). Visible per the account's visibility setting — a private account's handle 404s out-of-scope, it is never null |
| `display_name` | TEXT | optional at signup | scoped | Public display name. Optional at registration — server fills it from the handle (without `@`) when unfilled, so it is never null on a public surface (NOT NULL target) |
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
[identity_verified | residency_verified | electoral_validated]  (+ optional platform-assigned official ROLE)
```

Additional account states from contributor §5.4: `pending`, `failed`, `sponsored_pending`, `verification_not_completed`.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| Profile | 1:1 | Email / over_18 / prefs in `auth.profiles` (no legal name or street address) |
| Verification | 1:N | Append-only attestations; latest wins |
| Session | 1:N | Active login sessions |
| PasskeyCredential | 1:N | Account-login passkeys |
| ThreadPersona | 1:N | One per thread joined |
| Civic content | 1:N | Via signed record transactions |

## Invariants

- District is **never stored** on the user row ([GLOSSARY.md](../../GLOSSARY.md)).
- User may belong to **multiple jurisdictions** via a jurisdiction-membership table; every account is auto-subscribed to **`oursay-global`** at registration. Future: geocode-suggested subscription prompts. (Membership table is target — see Gaps.)
- Administrators cannot alter vote counts, verification statuses, or ledger records (contributor §4.7).
- Account privacy model ([09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md)) is specified (demo-proven); backend enforcement pending.

## Permissions

| Action | Who |
|--------|-----|
| Create | Self via OTP registration |
| Read public profile | Viewers within the account's effective visibility scope; out-of-scope → **404** ([09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md)) |
| Update public profile | Self (full session) |
| Delete | Platform policy (not fully specified) |

## Events

- Registration (least-resistance): creates `users` (**handle required**; display name optional — defaults to the handle) + `profiles` (email + over_18 checkbox required). **No** full name or street address on OurSay — Didit collects/holds those at KYC. Registration never blocks on location.
- Verification: appends `kyc_attestations` for `user_id`; on residency, geocode the address from the KYC seam → store private point (not street string).

## Examples

**Valid:** User with `handle: "@jane_alberta"`, `display_name: "Jane"`, no KYC → unverified tier, can act off-ledger.

**Invalid:** Registering without a handle — required at signup (display name may be omitted; it falls back to the handle). Storing `district_id` or `verification_tier` on `public.users` — tier comes from attestations; district is inferred after residency verification.

## Implementation

| Layer | Path |
|-------|------|
| DDL | `public-record/src/schema/postgres.sql.ts` → `users` |
| Repo | `api/src/repo/user.repo.ts` |
| Registration | `api/src/services/registration.service.ts` |
| Routes | `api/src/http/routes/registration.routes.ts` |

## Gaps

- **[mvp-c10b-membership]**: No user ↔ jurisdiction subscription (membership table + auto `oursay-global`) — see [account/future.md](./future.md).
- **handle/display_name NOT NULL migration** — columns are nullable today; target makes `handle` required at registration and `display_name` server-filled from the handle when omitted, with a backfill for existing rows — `[align-w3-gates-schema]`.
- Account visibility ([09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md)) not built — profile surface must 404 for out-of-scope viewers; the reveal model replaces the old persona `claimed`/`claimed_at` flow.
- **Official role** — platform-assigned, revocable `official` role (on the user/jurisdiction membership) for role-gated actions (e.g. AB poll creation); a role, never a KYC tier.
