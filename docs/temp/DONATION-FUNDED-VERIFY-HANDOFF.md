# Handoff — Donation-funded verification

**Status:** Product decision **locked** in docs; **UI/service seam still to build**.  
**Date:** 2026-07-12 (doc sweep completed same day)  
**Depends on:** Didit KYC seam ([DIDIT-KYC-SEAM-HANDOFF.md](./DIDIT-KYC-SEAM-HANDOFF.md)), especially [VerifyModal](../../web-app/src/components/chrome/VerifyModal.tsx) and [RecoveryKycModal](../../web-app/src/components/chrome/RecoveryKycModal.tsx).

## Product decision (locked)

We are **not** charging users for Didit verification at the gate.

| Old framing | New framing |
|-------------|-------------|
| At-cost POA / pay-before-verify | **Free verification** funded by optional donations |
| Payment gateway for KYC | **GitHub Sponsors** only (one-time + recurring) |
| Registration paywall | Signup OTP + passkey path **unchanged** (no paywall) |

**Model:** Before opening a Didit session on **identity verify, residency/POA, recovery KYC, or re-verify**, soft-ask for donations (suggest ranges such as $1–20; recurring encouraged). **Highly encouraged, never required** — skip continues to free verification. Donations pool toward verification capacity (Didit credits and related ops).

**Contingency (roadmap / gaps only):** If donations fail → escalate invasive banners/popups → last resort **pay-per-verification** (and optionally peer sponsorship / waitlist). Do not build the charge path until that contingency is declared.

Doc sweep away from at-cost / payment-gateway language is **done** (contributor §5.5, explainer, PRD, README, flows, stories, glossary, verification entity, roadmap, API gaps, legal Q12, etc.).

## What the next agent must do

### 1. Learn how to beg effectively (required research)

Before shipping UI copy, research high-converting **nonprofit / civic / open-source donation** patterns (GitHub Sponsors–compatible):

- Ask framing: mission (“fund the next citizen’s free verify”) vs guilt vs reciprocity
- Suggested amounts ($1 / $5 / $10 / $20) and one-time vs recurring
- **Blocking ask-first → then verify** vs donate on the same screen as Verify ID / Residency
- Owner note (non-binding): same-page “Donate” next to “Verify” is easy to ignore when the user’s mission is to verify — prefer a deliberate ask path unless research says otherwise.
- Recommend one primary UX with rationale after research.

### 2. Platform: GitHub Sponsors (locked)

Do **not** re-open a multi-vendor donation bake-off. Wire **GitHub Sponsors** (link / embed / deep-link as appropriate) behind a thin `DonationService` seam (stub in tests). Env for sponsor URL / org-or-user slug.

### 3. Surfaces (when implementing)

| Surface | Intent |
|---------|--------|
| **Pre-Didit step** | Soft-ask on verify / recover KYC / re-verify **before** `POST …/didit/session` (or equivalent open) |
| **Profile menu** | Persistent “Donate” / Sponsors entry |
| **Temp banner** | Reuse/replace slot where [DemoBanner](../../web-app/src/views/AppShell.tsx) sits today — campaign/on-need, dismissible |
| **Notifications / email campaigns** | Future; privacy-policy delta when marketing is added |

Registration stays frictionless: **never** require a donation to finish OTP/passkey.

### 4. Docs

Product docs already reflect the donation model. When shipping UI, update flow status / handoff residuals only. Privacy / ToS when email campaigns are in scope.

## Explicitly out of scope for the first donation PR (unless trivial)

- Full payment gateway + charge-for-POA path (contingency only)
- Peer sponsorship / waitlist (contingency under paid-verify)
- Email/notification donation campaigns (document + privacy delta later)
- Changing Didit workflow UUIDs or KYC award semantics

## Suggested ship order

1. Short UX design note in `docs/temp/` (ask pattern + Sponsors link shape)
2. `DonationService` + env + stub tests
3. Pre-Didit ask on VerifyModal / RecoveryKycModal (+ profile Donate + optional banner)
4. Handoff; campaigns and funding contingency marked future

## Context pointers

- Verify chooser: `web-app/src/components/chrome/VerifyModal.tsx`
- Recovery KYC: `web-app/src/components/chrome/RecoveryKycModal.tsx`
- Profile sheet: `web-app/src/components/chrome/ProfileModal.tsx`
- Fab area / demo banner: `web-app/src/views/AppShell.tsx` (`DemoBanner`)
- Didit ops (platform still pays Didit): `docs/DIDIT-KYC-SETUP.md`
- Spec: `docs/01-CONTRIBUTOR-SPEC.md` §5.5
