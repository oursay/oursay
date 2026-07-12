# Handoff — Donation-funded verification

**Status:** Product decision locked; **UI seam shipped** (env-gated; defaults off).  
**Date:** 2026-07-12  
**Depends on:** Didit KYC seam ([DIDIT-KYC-SEAM-HANDOFF.md](./DIDIT-KYC-SEAM-HANDOFF.md)).

## Product decision (locked)

Free verification; soft-ask via **GitHub Sponsors** (one-time + recurring). Never required.
Pay-per-verify is a donation-collapse contingency only (roadmap/gaps).

## Shipped (web-app)

| Piece | Path / flag |
|-------|-------------|
| Flags + Sponsors URL | `web-app/src/lib/donations/` · `NEXT_PUBLIC_GITHUB_SPONSORS_URL` |
| Public + KYC modal | `DonationModal` · `NEXT_PUBLIC_SHOW_DONATION_MODAL_PUBLIC` / `_KYC` |
| Donation banner | `DonationBanner` · `NEXT_PUBLIC_SHOW_DONATION_BANNER` (demo supersedes; console.warn) |
| Demo banner | `NEXT_PUBLIC_SHOW_DEMO_BANNER` (default on) |
| Wiring | `AppShell` — AuthChooser / Profile Donate / Verify + Recovery pre-session ask |
| Docs | repo-root `.env.example`, `web-app/README.md` |

Enable example (donation campaign, hide demo):

```env
NEXT_PUBLIC_GITHUB_SPONSORS_URL=https://github.com/sponsors/your-org
NEXT_PUBLIC_SHOW_DEMO_BANNER=false
NEXT_PUBLIC_SHOW_DONATION_BANNER=true
NEXT_PUBLIC_SHOW_DONATION_MODAL_PUBLIC=true
NEXT_PUBLIC_SHOW_DONATION_MODAL_KYC=true
```

## Residual / next

- UX copy research / amount chips → real Sponsors tiers if desired
- Email/push donation campaigns + privacy delta
- Funding contingency (invasive banners → pay-per-verify) — not launch

## Context pointers

- Verify: `web-app/src/components/chrome/VerifyModal.tsx`
- Recovery KYC: `web-app/src/components/chrome/RecoveryKycModal.tsx`
- Donation: `web-app/src/components/chrome/DonationModal.tsx`
- Spec: `docs/01-CONTRIBUTOR-SPEC.md` §5.5
