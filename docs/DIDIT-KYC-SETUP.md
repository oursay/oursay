# Didit setup for KYC verification

OurSay records verification **tiers** in `public.kyc_attestations` (identity, residency, electoral). The platform never stores document images, legal names from ID scans, or other vendor PII on the attestation row — only the awarded tier, provider tag, and an optional coarse region string.

In **development**, the default `KYC_PROVIDER=stub` lets tests and `POST /v1/dev/kyc/attest` place users at any tier with no network. In **production** (or dev walks against the real vendor), set `KYC_PROVIDER=didit` to use [Didit](https://didit.me) hosted verification sessions.

## Architecture

```
POST /v1/kyc/didit/session     →  KycSessionService  →  Didit API (create session)
GET  /v1/kyc/didit/session/:id →  poll decision       →  award tier on Approved
POST /v1/kyc/didit/webhook     →  HMAC verify         →  same idempotent award path
POST /v1/kyc/residency/attest  →  platform self-attest (geocode point inside jurisdiction)
```

- **Free KYC workflow** → `identity_verified` on approval
- **POA workflow** → `residency_verified` on approval (when `DIDIT_POA_WORKFLOW_ID` is set)
- **Platform residency** → `residency_verified` with provider `platform` when the user's private geocode point falls inside the jurisdiction (dev-friendly; production may later swap to Didit POA behind consent)

Code: `api/src/services/kyc/`, `api/src/services/kyc-session.service.ts`, `api/src/http/routes/kyc.routes.ts`.

## 1. Didit console setup

1. Sign in to the [Didit business console](https://business.didit.me).
2. Use the **sandbox application** for development (plan default: `338124df-d8da-4332-89ff-62a5e9da210a`).
3. Copy the **API key** into `DIDIT_API_KEY` (repo-root `.env` is loaded first).
4. **Workflows** → copy a **published** Free KYC workflow id into `DIDIT_WORKFLOW_ID` (required; there is no repo-wide default because workflow ids are per Didit application).
5. (Optional) Create and publish a **POA** workflow for paid proof-of-address; set `DIDIT_POA_WORKFLOW_ID`.
6. **Webhooks** → add destination URL `https://<your-api>/v1/kyc/didit/webhook`, subscribe to `status.updated`, store the returned `secret_shared_key` as `DIDIT_WEBHOOK_SECRET`.
7. Set `DIDIT_CALLBACK_URL` to where users return after the hosted flow (e.g. `https://oursay.ca/verification-complete`).

## 2. Configure `@oursay/api`

```env
KYC_PROVIDER=didit
DIDIT_API_KEY=<from Didit console>
DIDIT_WEBHOOK_SECRET=<from webhook destination create response>
DIDIT_BASE_URL=https://verification.didit.me
DIDIT_WORKFLOW_ID=<published Free KYC workflow from your Didit app>
DIDIT_POA_WORKFLOW_ID=
DIDIT_CALLBACK_URL=https://localhost:3000/verification-complete
```

Keep `KYC_PROVIDER=stub` in CI and local unit tests. Only enable `didit` on hosts that should call the vendor.

## 3. Verify the integration

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
```

Covers session start → poll → tier award, webhook HMAC, and idempotent double-delivery.

### Manual walk

1. Register and obtain a full session.
2. `POST /v1/kyc/didit/session` with `{ "workflowKind": "identity" }`.
3. Open the returned `url` in a browser and complete verification (uses your Didit sandbox credits sparingly).
4. `GET /v1/kyc/didit/session/:sessionId` until `status` is `approved` and `tier` is `identity_verified`.

For **residency** without a paid POA check: set address via `PATCH /v1/profile`, ensure geocoding resolves, then `POST /v1/kyc/residency/attest` with `{ "consent": true }`.

## 4. Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `501` on `/v1/kyc/didit/session` | `KYC_PROVIDER` still `stub` |
| `DiditKycProvider requires DIDIT_API_KEY` | Key missing at startup when `KYC_PROVIDER=didit` |
| HTTP 400 invalid workflow | Workflow id wrong or still **draft** — publish in console |
| Webhook `401` | Wrong `DIDIT_WEBHOOK_SECRET` or clock skew (>300s) |
| Poll stays `pending` | User has not finished hosted flow; or use webhook + poll |

## Related docs

- [`api/README.md`](../api/README.md) — KYC tiers overview
- [`docs/entities/account/verification.md`](./entities/account/verification.md) — tier semantics
- [Didit API docs](https://docs.didit.me)
