# Didit setup for KYC verification

OurSay records verification **tiers** in `public.kyc_attestations` (identity, residency, electoral). The platform never stores document images, legal names from ID scans, face embeddings, or face-match confidence scores — only the awarded tier, provider tag, and an optional coarse region string.

In **development**, the default `KYC_PROVIDER=stub` lets tests and `POST /v1/dev/kyc/attest` place users at any tier with no network. In **production** (or dev walks against the real vendor), set `KYC_PROVIDER=didit` to use [Didit](https://didit.me) hosted verification sessions.

## Architecture

```
POST /v1/kyc/didit/session           →  KycSessionService  →  Didit API (create session)
GET  /v1/kyc/didit/session/:id       →  poll decision       →  award tier on Approved (identity/poa)
POST /v1/kyc/didit/webhook           →  HMAC verify         →  same idempotent award / recovery unlock
POST /v1/auth/recovery/kyc/session   →  biometric recovery  →  unlock passkey re-enroll (no new tier)
POST /v1/kyc/residency/attest        →  platform self-attest (stub/dev; geocode point inside jurisdiction)
```

`vendor_data` on every Didit session is the stable OurSay `userId`. Same `vendor_data` is treated as the same Didit user and is excluded from duplicate-user / duplicate-face declines.

### Workflow → env → OurSay behaviour

| Console label | Env var | `workflowKind` | On Approved |
|---------------|---------|----------------|-------------|
| 01-VerifyID (OCR + Liveness + Face + IP) | `DIDIT_WORKFLOW_ID` | `identity` | Append `identity_verified` |
| 02-VerifyResidency (+ Proof of Address) | `DIDIT_WORKFLOW_POA` | `poa` | Append `residency_verified` |
| 03-Recovery/EmailLogin (biometric auth) | `DIDIT_WORKFLOW_RECOVER` | `recovery` | Unlock recovery passkey re-enroll (**no** new attestation) |

Example UUIDs for the OurSay **My Application** console app (replace if you recreate workflows):

| Env | Example UUID |
|-----|----------------|
| `DIDIT_WORKFLOW_ID` | `f6f319d0-21a3-4d8b-aba0-50399cb3752c` |
| `DIDIT_WORKFLOW_POA` | `d2665ee7-a5b7-4c1e-80c5-38d9deee9769` |
| `DIDIT_WORKFLOW_RECOVER` | `45a1c557-494f-481f-baea-dda4b7a1a5c0` |

### Duplicate-user rules (console)

Configure per workflow in Didit:

| Workflow | Duplicated users | Intent |
|----------|------------------|--------|
| 01 / 02 | **Decline** | Same person cannot verify under a **different** OurSay account (`vendor_data`) |
| 03 | **Allow** (`NO_ACTION`) | Returning user may match their own enrolled face for login/recovery |

Re-verification and ID→residency upgrades for the **same** account are not blocked by Decline: Didit excludes same-`vendor_data` sessions from duplicate checks.

### Recovery semantics

Workflow 03 is `biometric_authentication`: liveness + 1:1 face match against the face already stored for that `vendor_data` (from a prior approved KYC). OurSay gates on Didit’s **Approved / Declined** status using the workflow’s face-match thresholds — we do **not** store or compare confidence scores locally. Email OTP alone must not unlock recovery for verified accounts (US-SYS-5).

### Platform residency (stub/dev)

`POST /v1/kyc/residency/attest` awards `residency_verified` with provider `platform` when the user’s private geocode point falls inside the jurisdiction. When `KYC_PROVIDER=didit`, product residency verification uses workflow **02** instead.

Code: `api/src/services/kyc/`, `api/src/services/kyc-session.service.ts`, `api/src/http/routes/kyc.routes.ts`, `api/src/services/recovery.service.ts`.

---

## 1. Dev / sandbox console setup

1. Sign in to the [Didit business console](https://business.didit.me).
2. Prefer a **sandbox** application for development (example sandbox app id: `338124df-d8da-4332-89ff-62a5e9da210a`). Workflow UUIDs are **per application** — do not mix sandbox keys with production workflow ids.
3. Copy the **API key** into `DIDIT_API_KEY` (repo-root `.env` is loaded first).
4. Publish three workflows (labels above) and set:
   - `DIDIT_WORKFLOW_ID` (required for identity sessions)
   - `DIDIT_WORKFLOW_POA` (required for Didit residency)
   - `DIDIT_WORKFLOW_RECOVER` (required for verified-account recovery)
5. Apply duplicate-user rules (Decline on 01/02; allow on 03).
6. **Webhooks** → destination `https://<your-ngrok-host>/v1/kyc/didit/webhook`, subscribe to `status.updated`, store `secret_shared_key` as `DIDIT_WEBHOOK_SECRET`.
7. Set `DIDIT_CALLBACK_URL` to where users return after the hosted flow (e.g. `http://localhost:3000/profile/self`).

### ngrok (local webhook testing)

Tunnel the **API** port, not the Next.js port. With `api/.env` `PORT=6173`:

```powershell
# Terminal 1 — API (must have KYC_PROVIDER=didit)
npm run dev -w @oursay/api

# Terminal 2 — public tunnel to the API
ngrok http 6173
```

| Field | Value |
|-------|--------|
| Webhook URL | `https://<subdomain>.ngrok-free.app/v1/kyc/didit/webhook` |
| Method | `POST` |
| Probe | `GET https://<subdomain>.ngrok-free.app/v1/kyc/didit/webhook` → `{ "ok": true }` |

After Didit shows `secret_shared_key`, set `DIDIT_WEBHOOK_SECRET` and **restart the API**.

The web app on `:3000` only proxies `/v1/*` for browser traffic; Didit webhooks must hit the API origin directly via ngrok → `:6173`.

## 2. Configure `@oursay/api` (dev)

```env
KYC_PROVIDER=didit
DIDIT_API_KEY=<from Didit console>
DIDIT_WEBHOOK_SECRET=<from webhook destination create response>
DIDIT_BASE_URL=https://verification.didit.me
DIDIT_WORKFLOW_ID=<published 01-VerifyID uuid>
DIDIT_WORKFLOW_POA=<published 02-VerifyResidency uuid>
DIDIT_WORKFLOW_RECOVER=<published 03-Recovery/EmailLogin uuid>
DIDIT_CALLBACK_URL=http://localhost:3000/profile/self
```

Keep `KYC_PROVIDER=stub` in CI and local unit tests. Only enable `didit` on hosts that should call the vendor.

---

## 3. Production standup

Use this checklist before enabling Didit for real users. Do **not** use ngrok or sandbox workflow UUIDs in production.

### 3.1 Didit production application

1. In the [Didit business console](https://business.didit.me), create or select the **production** application (separate from sandbox).
2. Confirm billing / prepaid credits are funded for ID, liveness, face match, POA, and biometric auth as needed.
3. Create an API key for that production app only; store as `DIDIT_API_KEY` on the API host (secret manager / host env — never commit).

### 3.2 Publish workflows

1. Publish **01-VerifyID**, **02-VerifyResidency**, and **03-Recovery/EmailLogin** on the **production** app (feature sets as in the table above).
2. Set **Duplicated users → Decline** on 01 and 02; **Allow / NO_ACTION** on 03.
3. Copy the three published workflow UUIDs into host env (`DIDIT_WORKFLOW_ID`, `DIDIT_WORKFLOW_POA`, `DIDIT_WORKFLOW_RECOVER`). UUIDs from sandbox apps will fail or bill the wrong app.

### 3.3 API host environment

```env
KYC_PROVIDER=didit
DIDIT_API_KEY=<production app key>
DIDIT_WEBHOOK_SECRET=<production webhook secret>
DIDIT_BASE_URL=https://verification.didit.me
DIDIT_WORKFLOW_ID=<prod 01 uuid>
DIDIT_WORKFLOW_POA=<prod 02 uuid>
DIDIT_WORKFLOW_RECOVER=<prod 03 uuid>
DIDIT_CALLBACK_URL=https://<public-web-host>/profile/self
```

- Webhook URL must be public HTTPS: `https://<api-host>/v1/kyc/didit/webhook` (no ngrok).
- Empty `DIDIT_WEBHOOK_SECRET` is **fail-closed** (webhooks rejected).
- Unpublished or wrong-app workflow UUIDs yield Didit HTTP 400 / invalid workflow.

### 3.4 Webhooks

1. Console → Webhooks → add destination `https://<api-host>/v1/kyc/didit/webhook`.
2. Subscribe to `status.updated`.
3. Store returned `secret_shared_key` as `DIDIT_WEBHOOK_SECRET`; restart API after rotate.
4. Probe `GET /v1/kyc/didit/webhook` → `{ "ok": true }`.

### 3.5 Smoke after deploy

1. Identity: authenticated `POST /v1/kyc/didit/session` `{ "workflowKind": "identity" }` → complete hosted flow → confirm `public.kyc_attestations` row `identity_verified` / provider `didit`.
2. Residency (optional, costs POA): `{ "workflowKind": "poa" }` → `residency_verified`.
3. Recovery: verified account → recovery OTP → biometric session via recovery KYC route → Approved → passkey re-enroll (no extra attestation row).

### 3.6 What we never store

Didit holds documents and biometrics. OurSay stores only session tracking (`auth.kyc_sessions`) and tier facts (`public.kyc_attestations`). Face-match confidence stays inside Didit’s decision; we key off Approved/Declined.

### 3.7 Ops notes

- Auto-blocklist / face lists are configured in the Didit console, not in OurSay.
- Rotate API keys and webhook secrets if leaked; update host env and restart.
- Keep sandbox credentials and workflow UUIDs out of production hosts.

---

## 4. Verify the integration (dev)

### Live smoke test (session create only)

`api/test/33-didit-session-smoke.spec.ts` creates one sandbox session and writes:

`api/test/.output/didit-session-create.json`

Skips if the file exists. Delete it to re-run.

```powershell
cd api
npx mocha --grep "didit: live" test/33-didit-session-smoke.spec.ts
```

### Unit tests (fake fetch, no vendor calls)

```powershell
npm test -w @oursay/api -- --grep "20 kyc didit"
npm test -w @oursay/api -- --grep "05 recovery"
```

### Manual walk

1. Register and obtain a full session.
2. `POST /v1/kyc/didit/session` with `{ "workflowKind": "identity" }`.
3. Open the returned `url` and complete verification (sandbox credits).
4. `GET /v1/kyc/didit/session/:sessionId` until `status` is `approved` and `tier` is `identity_verified`.
5. For Didit residency: `{ "workflowKind": "poa" }` (requires `DIDIT_WORKFLOW_POA`).
6. For stub/dev residency without Didit POA: `PATCH /v1/profile` address → `POST /v1/kyc/residency/attest` with `{ "consent": true }`.

---

## 5. Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `501` on `/v1/kyc/didit/session` | `KYC_PROVIDER` still `stub` |
| `DiditKycProvider requires DIDIT_API_KEY` | Key missing at startup when `KYC_PROVIDER=didit` |
| `DIDIT_WORKFLOW_POA is required` | POA session without `DIDIT_WORKFLOW_POA` |
| `DIDIT_WORKFLOW_RECOVER is required` | Recovery biometric without `DIDIT_WORKFLOW_RECOVER` |
| HTTP 400 invalid workflow | UUID wrong, still **draft**, or from another Didit application |
| Webhook `401` | Wrong `DIDIT_WEBHOOK_SECRET` or clock skew (>300s) |
| Poll stays `pending` | User has not finished hosted flow; or use webhook + poll |
| Recovery 400 “No stored face…” | User never completed an approved KYC with a face for that `userId` |

## Related docs

- [`api/README.md`](../api/README.md) — KYC tiers overview
- [`docs/entities/account/verification.md`](./entities/account/verification.md) — tier semantics
- [Didit API docs](https://docs.didit.me)
- [Biometric Authentication](https://docs.didit.me/core-technology/biometric-auth/overview)
