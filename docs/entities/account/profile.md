# Profile

## Definition

Account-private row for a registered user: **email**, age gate (`over_18`), and account prefs — never on the public user row. Used for login, recovery contact, and privacy defaults.

**Identity text PII is not stored here.** Legal name, government ID data, biometrics, and the residential **street address string** are held by the **KYC provider** (Didit). On residency success OurSay receives an address, geocodes it, and stores the **point** on [ProfileGeocode](./profile-geocode.md) — not address columns on this row. See also KYC **session refs** and **attestations** keyed by `user_id` ([verification.md](./verification.md), [account/future.md](./future.md)).

**Registration is least-resistance:** email, required public handle (display name optional — defaults to the handle; see [User](./user.md)), and the `over_18` self-attestation. No legal-name or address fields. The age gate is the **`over_18`** boolean — self-attested at signup, re-confirmed via KYC; the platform needs only the adult flag, not a stored date of birth.

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
| `over_18` | boolean | yes | no | **Target** age gate: self-attested checkbox at signup, KYC re-confirms; replaces stored `birthdate` (see Gaps) |
| `visibility` | enum | yes | no | **Target** account-default author visibility; default `'anonymous'` ([09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md)) |
| `email` | TEXT | yes | no | As user typed |
| `email_canonical` | TEXT | yes | no | Normalized; unique |
| `created_at` | TIMESTAMPTZ | yes | no | |

**Removed from target model (do not collect / drop when migrating):** `first_name`, `last_name`, `address_line1`, `address_line2`, `city`, `province`, `postal_code`, `address_memo`. Code/schema may still have these columns until the non-storage migration.

Public-facing name fields (`handle`, `display_name`) live on [User](./user.md), not here. Display name is **not** legal name.

## States & lifecycle

```
[registration sets profile — email + over_18]
        │ KYC residency/POA: provider returns address (ephemeral)
        ▼
[geocode → ProfileGeocode.geom; attestation for user_id — no street address on profile]
```

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| User | 1:1 | CASCADE delete |
| ProfileGeocode | 0..1 | Private point from residency geocode |
| Verification | indirect | Attestations reference `user_id`; provider holds identity text PII |

## Invariants

- **R6 [Invariant]**: Raw content / remaining account PII in a separate mutable store, not on the append-only ledger ([REQUIREMENTS.md](../../../public-record/REQUIREMENTS.md)).
- **No legal name or street address on OurSay profiles** — KYC seam is system of record; residency yields a stored **point** only ([account/future.md](./future.md)).
- No district binding persisted — boundaries shift over time.
- Encrypting profile name/address columns is **not** a milestone (those fields are not retained). Point encryption vs GIS: see [profile-geocode.md](./profile-geocode.md).

## Permissions

| Action | Who |
|--------|-----|
| Create | Self at registration |
| Read | Self only (full session) |
| Update | Self only (prefs / email flows — not KYC PII) |

## Events

- Registration: profile insert + OTP verify (email + over_18).
- KYC pass/fail: attestation / session updates; residency success triggers geocode → point (no profile street-address sync).

## Examples

**Valid:** Profile with email + `over_18`; residency attested via Didit → tier on `kyc_attestations` + private geocode point; no street address column filled.

**Invalid:** Returning legal name or street address from any OurSay API. Storing a copy of Didit’s ID/POA text payload on `auth.profiles`.

## Implementation

| Layer | Path |
|-------|------|
| DDL | `api/src/schema/auth.sql.ts` → `auth.profiles` |
| Repo | `api/src/repo/profile.repo.ts` |
| HTTP schema | `api/src/http/schemas.ts` |
| Routes | `api/src/http/routes/profile.routes.ts` |

## Gaps

- **KYC-held text PII / drop name+street columns** — code may still have leftover profile name/address columns; target is removal + POA→geocode→point. Street-address self-service write path retired. See [account/future.md](./future.md).
- **Age-gate storage drift** — code today stores `auth.profiles.birthdate` (DATE NOT NULL) and computes 18+ at registration (`api/src/helpers/age.ts`). Target stores only `over_18` (boolean; signup checkbox, KYC re-confirms). Tracked as `[code-over-18]`. <!-- see .agents/CODE-ALIGNMENT-PROMPTS.md -->
- **Registration input drift** — `POST /v1/auth/otp/verify` (`profileInputSchema`) today accepts name/address and **requires** `birthdate`; target is handle + `over_18` (+ optional displayName) only — `[align-w3-gates-schema]`.
- **`[mvp-c10c-profile-patch]` (shipped retarget):** `PATCH /v1/profile` updates handle / display name / bio (`profile_details`); not street/legal name. Visibility remains `PATCH /v1/me/visibility`. Geocode refresh is KYC/POA-driven only.
- **Geocode point encryption vs GiST** — open; see [profile-geocode.md](./profile-geocode.md).
