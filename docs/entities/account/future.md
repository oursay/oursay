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

**Residency → point (required):** On residency/POA success, OurSay **receives coords and/or an address from the KYC seam**, resolves a point, and **stores the encoded point** for district inference (`region.contains(point)`). Prefer Didit `document_location` when present; otherwise geocode the structured address. Street text is used **ephemerally** (and may leave a non-reversible location hash — DB column `address_hash` — for cache invalidation) — it is **not** written back onto the profile. When a point exists, hash and store **3-dp (~100 m) rounded** lon/lat; when unresolved, hash the normalized address only. Legal name never lands on OurSay.

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

**Official role on membership:** the `official` role (and seat binding) lives on this membership — **jurisdiction-scoped**, not platform-wide. An official in `ab-ca-gov` does not appear as Official in another province’s jurisdiction.

**Official role inheritance (future):** a higher jurisdiction (e.g. future `ca-gov`) may **inherit** selected seats/roles from child jurisdictions (e.g. provincial premiers) so one seat claim can surface Official status where configured. Inheritance is explicit and allowlisted — never “all officials everywhere.” Until that ships, each jurisdiction assigns Official independently.

**Media is not a membership role:** there is **no** per-jurisdiction gallery/media role on membership. Media uses [accreditation-body.md](./accreditation-body.md) + [media-accreditation.md](./media-accreditation.md) and jurisdiction `recognizedAccreditationBodyIds`.

## Platform `admin` role (V1 manual ops)
Platform-wide **`admin`** (not `platform_admin`) manually maintains: accreditation-body catalog, Media accreditation grant/revoke, Official seat/role assignment, moderation/redaction, and district roster ops — see [admin.md](./admin.md). No automation of Official or Media credential classes in V1.
## Profile PATCH
`PATCH /v1/profile` updates OurSay-owned public identity: handle, display name, bio (in `users.profile_details` JSONB). **Do not** use it as a legal-name/street-address write path; residency re-verify / KYC seam supplies address for geocode refresh. Visibility stays on `PATCH /v1/me/visibility`. (`[mvp-c10c-profile-patch]` retargeted and shipped for identity fields.)

## Reveal model (persona → profile)
Linking a thread persona to a public profile is the **reveal** flow: a **platform reveal** is reversible (off-ledger), an **on-chain reveal** is nuclear (permanent). Replaces the old `claimed`/`claimed_at` columns. Privacy surface defined in [09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md). See also [civic-identity/future.md](../civic-identity/future.md).

## Verification — provider tags
Didit is the MVP provider (dev: ID-only + platform self-signed address; prod: POA). The platform pays Didit; users verify for free with an optional GitHub Sponsors soft-ask. Future provider tags, orthogonal to tiers: Equifax (`canadian_verified`) (provider list price is an ops concern, not a user gate), election authority KYC (`electoral_verified`). Residency ≠ electoral eligibility; never imply an elector status without electoral verification providers per jurisdiction.
→ `[code-didit-provider]`. <!-- see .agents/CODE-ALIGNMENT-PROMPTS.md -->

## Funding contingency (donations collapse)
If soft-asks and banners cannot fund provider capacity: escalate invasive donation UX, then as last resort introduce pay-per-verification (and optionally peer sponsorship / waitlist). Not launch scope.

## Boundary change → residency reverify (deferred)

When district boundaries change, flag users near a **moved edge** (within the stored **3-dp / ~100 m** rounding grid) that **reverification is recommended**; optionally revoke residency KYC when detection is accurate enough. Candidate check: a **2×2** round-down/up matrix of lat/lon cells around the stored point (retry at 4–5 dp if needed). **Shrink:** only users who could fall outside the new geometry. **Grow:** do not mass-flag the grown interior — impact the shrunken neighbor if that is where the edge moved. Details: [profile-geocode.md](./profile-geocode.md) (*Future: boundary change*). Not evaluated at POA-approve time.

## Encryption at rest — narrowed

| Data | Stance |
|------|--------|
| Legal name, street address string, KYC documents | **Not stored** on OurSay → no profile-field encryption milestone |
| Thread-binding salts / commitment openings | Still platform PII — encrypt-at-rest (KMS) remains a follow-on for **those** fields |
| Geocode **point** (`geom`) | **Stored** for GIS; **column-level encrypt likely incompatible with GiST / `ST_Contains`** — see [profile-geocode.md](./profile-geocode.md). Prefer volume/disk encryption + access control; leave open if a workable encrypted-spatial path appears. |
