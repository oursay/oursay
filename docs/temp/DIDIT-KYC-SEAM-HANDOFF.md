# Handoff — Didit KYC seam completion

**Date:** 2026-07-12  
**Scope:** docs → api+tests → web-app+tests (this change set)

## What shipped

### Docs / env
- [docs/DIDIT-KYC-SETUP.md](../DIDIT-KYC-SETUP.md) rewritten: three-workflow map, duplicate-user rules, recovery semantics, **production standup checklist**.
- Env rename: `DIDIT_WORKFLOW_POA`, `DIDIT_WORKFLOW_RECOVER` (replaces `DIDIT_POA_WORKFLOW_ID`). Updated [`.env.example`](../../.env.example) and [api/.env.example](../../api/.env.example).

### API
- Config reads `DIDIT_WORKFLOW_POA` + `DIDIT_WORKFLOW_RECOVER`.
- `auth.kyc_sessions.workflow_kind` includes `recovery`; session scope `recovery_kyc` for verified recovery challenges.
- Identity / POA: existing Didit session routes; recovery approve does **not** append attestations.
- Verified recovery: OTP → `recovery_kyc` session → `POST/GET /v1/auth/recovery/kyc/session` → on Approved issue `recovery` session for passkey re-enroll.
- `GET /v1/public/kyc` → `{ provider: "stub"|"didit"|… }` for UI routing.
- Tests: `05-recovery`, `20-kyc-didit` (including recovery no-attestation + public provider flag).

### Web-app
- **Get verified** opens Verify ID / Verify Residency chooser ([VerifyModal](../../web-app/src/components/chrome/VerifyModal.tsx)).
- When provider is `didit`: hosted session open + poll; stub keeps dev-attest / platform residency attest.
- Verified recovery: [RecoveryKycModal](../../web-app/src/components/chrome/RecoveryKycModal.tsx) after OTP.
- Client helpers + tests: [web-app/src/lib/api/kyc.ts](../../web-app/src/lib/api/kyc.ts).

## Env checklist (sandbox or prod)

```env
KYC_PROVIDER=didit
DIDIT_API_KEY=
DIDIT_WEBHOOK_SECRET=
DIDIT_BASE_URL=https://verification.didit.me
DIDIT_WORKFLOW_ID=        # 01-VerifyID
DIDIT_WORKFLOW_POA=       # 02-VerifyResidency
DIDIT_WORKFLOW_RECOVER=   # 03-Recovery/EmailLogin
DIDIT_CALLBACK_URL=
```

Example My Application UUIDs (replace if recreated): see DIDIT-KYC-SETUP.md.  
Web-app live mode: `NEXT_PUBLIC_MOCK_ONLY=false`.

After schema change, restart API so `Db.init()` applies CHECK wideners (`recovery` / `recovery_kyc`).

## How to smoke

**API unit (no vendor):**
```powershell
cd api
npx mocha --grep "05 recovery|20 kyc didit" "test/**/*.spec.ts"
```

**Web-app unit:**
```powershell
cd web-app
npx vitest run src/lib/api/kyc.test.ts
```

**Manual Didit (sandbox):** follow DIDIT-KYC-SETUP §4 — identity session, optional POA, verified recovery biometric.  
**Production:** follow DIDIT-KYC-SETUP §3 (prod app, HTTPS webhook, no ngrok).

## Residual gaps / notes

- **Donation soft-ask UI (next agent):** docs locked to free verify + GitHub Sponsors ask before Didit; implement UI/service per [DONATION-FUNDED-VERIFY-HANDOFF.md](./DONATION-FUNDED-VERIFY-HANDOFF.md).
- Official role remains separate from KYC (dev cycle no longer auto-promotes to Official via Get verified).
- Equifax / electoral providers still reserved.
- Auto-blocklist / face lists stay Didit-console ops.
- Live e2e specs `33` / `34` still optional when credentials present.

## Flow status

- [docs/11-USER-FLOWS.md](../11-USER-FLOWS.md) 1.5 verified branch, 2.1, 2.2 updated toward Built (Didit wired; sandbox/prod ops as above).
