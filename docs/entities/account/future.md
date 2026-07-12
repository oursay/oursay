# Account — future / deferred

Deferred design intent for the `account/` entities (user, profile, verification, profile-geocode). These are **not** shipped; they capture agreed direction so it is not lost. See each entity's **Gaps** section for the matching code-alignment prompt.

## KYC-held identity PII (no OurSay street/name copy) — locked intent

**Didit (the KYC seam) is the system of record for legal name, government-ID data, proof-of-address documents, biometrics, and the residential street address string.** OurSay must **not** persist those fields on `auth.profiles` (or anywhere else as recoverable address/name text).

| OurSay keeps | OurSay does **not** keep |
|--------------|---------------------------|
| `user_id` and account auth (email, passkeys, sessions) | `first_name` / `last_name` |
| `over_18` (signup checkbox; KYC re-confirms adult status as a tier fact, not a stored DOB) | Street address lines, city, postal code, address memos as profile columns |
| `auth.kyc_sessions` (provider session refs keyed by `user_id`) | Document images, face embeddings, face-match scores |
| `public.kyc_attestations` (tier, provider, `attested_at`, optional coarse `region`) | A durable mirror of Didit’s ID/POA payload / legal name |
| **`auth.profile_geocodes.geom`** — private PostGIS point from residency | Raw address string after geocode |

**Residency → point (required):** On residency/POA success, OurSay **receives an address from the KYC seam**, geocodes it, and **stores the encoded point** for district inference (`region.contains(point)`). The street address is used **ephemerally for geocoding** (and may leave a non-reversible `address_hash` for cache invalidation) — it is **not** written back onto the profile. Legal name never lands on OurSay.

**Why drop name/street storage:** Avoid a second copy of KYC identity PII, skip encrypting those columns, and shrink retention/erasure surface. Attestation + `user_id` + private point is enough for gates and geo counts.

**Registration:** email OTP + handle + `over_18` (+ optional display name). **No** legal-name or address fields at signup.

**Point encryption vs GIS indexing:** See [profile-geocode.md](./profile-geocode.md) (*Encryption vs spatial index*). Working assumption: **column-level encryption of `geom` is incompatible with PostGIS GiST / `ST_Contains`**; store the point in queryable form; harden with volume/disk encryption and access control. Treat full certainty as open until proven otherwise.

→ Gaps on [profile.md](./profile.md), [verification.md](./verification.md), [profile-geocode.md](./profile-geocode.md).

## over_18 replaces stored birthdate
The age gate stores only the boolean **`over_18`** — a self-attested checkbox at registration, re-verified factually at the KYC step — dropping `auth.profiles.birthdate`. Today `birthdate` (DATE) is stored and 18+ is computed at registration (`api/src/helpers/age.ts`).
→ `[code-over-18]`. <!-- see .agents/CODE-ALIGNMENT-PROMPTS.md -->

## Least-resistance registration
Registration requires **email OTP + handle + the over_18 checkbox** only; **display name is optional** (falls back to the handle). **No** full name or address on OurSay (KYC-held — see above). `profileInputSchema` / `RegistrationService` still require `birthdate` and still accept name/address today — drift to remove.
→ `[align-w3-gates-schema]`. <!-- see .agents/WEB-APP-ALIGNMENT-PROMPTS.md -->

## Jurisdiction membership table
A user ↔ jurisdiction membership table; every account auto-subscribed to **`oursay-global`** at registration. Future: subscription prompts after residency geocode yields a usable point. ([mvp-c10b-membership])

## Profile PATCH
`PATCH /v1/profile` for account prefs (e.g. visibility) remains useful. **Do not** use it as a legal-name/street-address write path; residency re-verify / KYC seam supplies address for geocode refresh. ([mvp-c10c-profile-patch] retargeted.)

## Reveal model (persona → profile)
Linking a thread persona to a public profile is the **reveal** flow: a **platform reveal** is reversible (off-ledger), an **on-chain reveal** is nuclear (permanent). Replaces the old `claimed`/`claimed_at` columns. Privacy surface defined in [09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md). See also [civic-identity/future.md](../civic-identity/future.md).

## Verification — provider tags
Didit is the MVP provider (dev: ID-only + platform self-signed address; prod: POA). The platform pays Didit; users verify for free with an optional GitHub Sponsors soft-ask. Future provider tags, orthogonal to tiers: Equifax (`canadian_verified`) (provider list price is an ops concern, not a user gate), election authority KYC (`electoral_verified`). Residency ≠ electoral eligibility; never imply an elector status without electoral verification providers per jurisdiction.
→ `[code-didit-provider]`. <!-- see .agents/CODE-ALIGNMENT-PROMPTS.md -->

## Funding contingency (donations collapse)
If soft-asks and banners cannot fund provider capacity: escalate invasive donation UX, then as last resort introduce pay-per-verification (and optionally peer sponsorship / waitlist). Not launch scope.

## Encryption at rest — narrowed

| Data | Stance |
|------|--------|
| Legal name, street address string, KYC documents | **Not stored** on OurSay → no profile-field encryption milestone |
| Thread-binding salts / commitment openings | Still platform PII — encrypt-at-rest (KMS) remains a follow-on for **those** fields |
| Geocode **point** (`geom`) | **Stored** for GIS; **column-level encrypt likely incompatible with GiST / `ST_Contains`** — see [profile-geocode.md](./profile-geocode.md). Prefer volume/disk encryption + access control; leave open if a workable encrypted-spatial path appears. |
