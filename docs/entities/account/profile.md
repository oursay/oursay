# Profile

## Definition

Private personally identifiable information (PII) for a registered user. Legal name, address, email, and birthdate live here — never on the public user row. Used for KYC, geocoding, and account recovery.

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
| `first_name` | TEXT | no | **never** | Private PII (KYC) |
| `last_name` | TEXT | no | **never** | Private PII (KYC) |
| `address_line1` | TEXT | no | no | Private |
| `address_line2` | TEXT | no | no | Private |
| `city` | TEXT | no | no | Private |
| `province` | TEXT | no | no | Canada-centric storage |
| `postal_code` | TEXT | no | no | Private |
| `country` | TEXT | yes | no | Default `'CA'` |
| `address_memo` | TEXT | no | no | Jurisdiction-specific extra |
| `birthdate` | DATE | yes | no | 18+ gate at registration |
| `email` | TEXT | yes | no | As user typed |
| `email_canonical` | TEXT | yes | no | Normalized; unique |
| `created_at` | TIMESTAMPTZ | yes | no | |

Public-facing name fields (`handle`, `display_name`) live on [User](./user.md), not here.

## States & lifecycle

Created atomically at registration. Address changes trigger geocode refresh (service exists; PATCH route gap).

```
[registration sets profile]
        │ address change (future PATCH)
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

- **[mvp-c10c-profile-patch]**: `GeocodeService.syncGeocodeForUser` exists; no `PATCH /v1/profile` yet.
