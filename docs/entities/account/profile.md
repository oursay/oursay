# Profile

## Definition

Private personally identifiable information (PII) for a registered user. Legal name, address, and email live here — never on the public user row. Used for KYC, geocoding, and account recovery. **Registration is least-resistance:** email, the required public handle (display name optional — defaults to the handle; see [User](./user.md)), and the `over_18` self-attestation are required at signup; **full name and address are optional signup fields** behind a helper (*fill these before ID/residency verification; without an address the platform cannot auto-recommend jurisdictions — a V1 feature at 5+ jurisdictions*). Whatever is left blank arrives at the **KYC step** (Didit) or a later profile update. No location / a pseudo location never blocks registration (geocoding is best-effort in code today). The age gate is the **`over_18`** boolean (target) — self-attested at signup, re-verified by KYC; the platform needs only the adult flag, not a stored date of birth.

## Aliases

| Layer | Name |
|-------|------|
| Product | Account profile / private details |
| Code | `Profile`, `auth.profiles` |
| HTTP | `PATCH`-able profile input (partial today) |

See [GLOSSARY.md](../../GLOSSARY.md) and [06-PRIVACY-REVIEW.md](../../06-PRIVACY-REVIEW.md).

## Identity

One profile per user. Primary key: `auth.profiles.user_id` → `public.users.id`.

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `user_id` | UUID | yes | no | FK → `users.id` |
| `first_name` | TEXT | no (optional at signup, else KYC) | **never** | Private PII |
| `last_name` | TEXT | no (optional at signup, else KYC) | **never** | Private PII |
| `address_line1` | TEXT | no (optional at signup, else KYC / profile update) | no | Private |
| `address_line2` | TEXT | no | no | Private |
| `city` | TEXT | no (empty until KYC) | no | Private |
| `province` | TEXT | no (empty until KYC) | no | Canada-centric storage |
| `postal_code` | TEXT | no (empty until KYC) | no | Private |
| `country` | TEXT | yes | no | Default `'CA'` |
| `address_memo` | TEXT | no | no | Jurisdiction-specific extra |
| `over_18` | boolean | yes | no | **Target** age gate: self-attested checkbox at signup, KYC re-verifies; replaces stored `birthdate` (see Gaps) |
| `visibility` | enum | yes | no | **Target** account-default author visibility; default `'anonymous'` ([09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md)) |
| `email` | TEXT | yes | no | As user typed |
| `email_canonical` | TEXT | yes | no | Normalized; unique |
| `created_at` | TIMESTAMPTZ | yes | no | |

Public-facing name fields (`handle`, `display_name`) live on [User](./user.md), not here.

## States & lifecycle

Created atomically at registration with **email + over_18** (name/address columns filled only if
the user chose to provide them at signup). The first address write — at signup, KYC, or via
profile PATCH — triggers the geocode sync (service exists; PATCH route gap; never blocking).

```
[registration sets profile — email + over_18 (+ optional name/address)]
        │ signup / KYC step / profile PATCH supplies name + address
        ▼
[geocode sync → ProfileGeocode updated]
```

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| User | 1:1 | CASCADE delete |
| ProfileGeocode | 1:1 | Current geocoded point |
| Verification | indirect | KYC provider reads profile fields |

## Invariants

- **R6 [Invariant]**: Raw PII in separate mutable store, not on append-only ledger ([REQUIREMENTS.md](../../../public-record/REQUIREMENTS.md)).
- Legal name never publicly surfaced ([GLOSSARY.md](../../GLOSSARY.md)).
- No district binding persisted — boundaries shift over time.
- Encryption-at-rest (KMS) is a follow-on milestone.

## Permissions

| Action | Who |
|--------|-----|
| Create | Self at registration |
| Read | Self only (full session) |
| Update | Self only |
| Read by platform | KYC provider integration, geocode service |

## Events

- Registration: profile insert + OTP verify.
- Address change: triggers `GeocodeService.syncGeocodeForUser()` (when PATCH lands).

## Examples

**Valid:** Profile with complete Alberta address → geocode → district inferred at count time.

**Invalid:** Returning `first_name` or street address in any public API response.

## Implementation

| Layer | Path |
|-------|------|
| DDL | `api/src/schema/auth.sql.ts` → `auth.profiles` |
| Repo | `api/src/repo/profile.repo.ts` |
| HTTP schema | `api/src/http/schemas.ts` |
| Routes | `api/src/http/routes/profile.routes.ts` |

## Gaps

- **Age-gate storage drift** — code today stores `auth.profiles.birthdate` (DATE NOT NULL) and computes 18+ at registration (`api/src/helpers/age.ts`). Target stores only `over_18` (boolean; signup checkbox, KYC re-verifies). Tracked as `[code-over-18]`; the column remains until migration. <!-- see .agents/CODE-ALIGNMENT-PROMPTS.md -->
- **Registration input drift** — `POST /v1/auth/otp/verify` (`profileInputSchema`) today accepts name/address and **requires** `birthdate`; target requires handle + `over_18` checkbox, with displayName (falls back to handle), full name, and address optional — `[align-w3-gates-schema]`.
- **[mvp-c10c-profile-patch]**: `GeocodeService.syncGeocodeForUser` exists; no `PATCH /v1/profile` yet — see [account/future.md](./future.md).
- `visibility` column (account-default author visibility) not in schema yet — [09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md).
