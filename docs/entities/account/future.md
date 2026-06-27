# Account — future / deferred

Deferred design intent for the `account/` entities (user, profile, verification, profile-geocode). These are **not** shipped; they capture agreed direction so it is not lost. See each entity's **Gaps** section for the matching code-alignment prompt.

## over_18 replaces stored birthdate
The age gate should store only the boolean **`over_18`**, dropping `auth.profiles.birthdate`, provided the KYC/recovery flow can re-prompt for age when needed. Today `birthdate` (DATE) is stored and 18+ is computed at registration (`api/src/helpers/age.ts`).
→ `.agents/CODE-ALIGNMENT-PROMPTS.md` `[code-over-18]`.

## Jurisdiction membership table
A user ↔ jurisdiction membership table; every account auto-subscribed to **`oursay-global`** at registration. Future: geocode-suggested subscription prompts after a profile address resolves. ([mvp-c10b-membership])

## Profile PATCH + geocode refresh
`PATCH /v1/profile` so address edits re-trigger `GeocodeService.syncGeocodeForUser`. Service exists; route does not. ([mvp-c10c-profile-patch])

## Reveal model (persona → profile)
Linking a thread persona to a public profile is the **reveal** flow: a **platform reveal** is reversible (off-ledger), an **on-chain reveal** is nuclear (permanent). Replaces the old `claimed`/`claimed_at` columns. Privacy surface defined in [09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md). See also [civic-identity/future.md](../civic-identity/future.md).

## Verification — provider tags
Didit is the MVP provider (dev: ID-only + platform self-signed address; prod: POA ~$2 CAD). Future provider tags, orthogonal to tiers: Equifax (`canadian_verified`) (~$16/check), election authority KYC (`electoral_verified`). Residency ≠ electoral eligibility; never imply an elector status without electoral verification providers per jurisdiction.
→ `.agents/CODE-ALIGNMENT-PROMPTS.md` `[code-didit-provider]`.

## Encryption at rest
PII encryption-at-rest (KMS) for `auth.profiles` and geocode points is a follow-on milestone.
