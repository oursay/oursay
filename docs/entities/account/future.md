# Account — future / deferred

Deferred design intent for the `account/` entities (user, profile, verification, profile-geocode). These are **not** shipped; they capture agreed direction so it is not lost. See each entity's **Gaps** section for the matching code-alignment prompt.

## over_18 replaces stored birthdate
The age gate stores only the boolean **`over_18`** — a self-attested checkbox at registration, re-verified factually at the KYC step — dropping `auth.profiles.birthdate`. Today `birthdate` (DATE) is stored and 18+ is computed at registration (`api/src/helpers/age.ts`).
→ `[code-over-18]`. <!-- see .agents/CODE-ALIGNMENT-PROMPTS.md -->

## Least-resistance registration
Registration requires **email OTP + handle + the over_18 checkbox** only; **display name is optional** (falls back to the handle) and **full name/address are optional signup fields** behind a helper (fill before ID/residency verification; without an address the platform cannot auto-recommend jurisdictions — V1, 5+ jurisdictions). Whatever is left blank moves to the KYC step (or a later profile PATCH), which also triggers the first geocode sync — never blocking, so no-location / out-of-Alberta users register fine. `profileInputSchema` / `RegistrationService` still require `birthdate` today.
→ `[align-w3-gates-schema]`. <!-- see .agents/WEB-APP-ALIGNMENT-PROMPTS.md -->

## Jurisdiction membership table
A user ↔ jurisdiction membership table; every account auto-subscribed to **`oursay-global`** at registration. Future: geocode-suggested subscription prompts after a profile address resolves. ([mvp-c10b-membership])

## Profile PATCH + geocode refresh
`PATCH /v1/profile` so address edits re-trigger `GeocodeService.syncGeocodeForUser`. Service exists; route does not. ([mvp-c10c-profile-patch])

## Reveal model (persona → profile)
Linking a thread persona to a public profile is the **reveal** flow: a **platform reveal** is reversible (off-ledger), an **on-chain reveal** is nuclear (permanent). Replaces the old `claimed`/`claimed_at` columns. Privacy surface defined in [09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md). See also [civic-identity/future.md](../civic-identity/future.md).

## Verification — provider tags
Didit is the MVP provider (dev: ID-only + platform self-signed address; prod: POA ~$2 CAD). Future provider tags, orthogonal to tiers: Equifax (`canadian_verified`) (~$16/check), election authority KYC (`electoral_verified`). Residency ≠ electoral eligibility; never imply an elector status without electoral verification providers per jurisdiction.
→ `[code-didit-provider]`. <!-- see .agents/CODE-ALIGNMENT-PROMPTS.md -->

## Encryption at rest
PII encryption-at-rest (KMS) for `auth.profiles` and geocode points is a follow-on milestone.
