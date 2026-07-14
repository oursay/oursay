# Postmark setup for OTP email

OurSay sends email one-time codes (OTP) for three bootstrap flows only: **registration**, **recovery**, and **gated cross-device login**. Codes are generated and hashed in `@oursay/api`; delivery is handled by the pluggable **mailer** (`MailerService`), which routes each flow to a configured vendor adapter.

In **development**, the default vendor is `noop` — messages are recorded in memory and OTP codes are echoed to the API console so `/walk` and Swagger walks work without an inbox. In **production**, configure **Postmark** (or SMTP / SES) so codes reach users.

This guide covers standing up Postmark and selecting it as the OTP connector for a production deployment.

## Architecture (short)

```
POST /v1/auth/otp/request  →  OtpService  →  MailerService.send(role, message)
                                                    ↓
                                          PostmarkMailAdapter (outbound stream, tag: otp)
```

- **Roles** map 1:1 to OTP purposes: `registration`, `recovery`, `login`.
- Plaintext OTP codes are **never** stored, logged, or returned by the API.
- Postmark sends use the `outbound` message stream and are tagged `otp` for activity filtering.

Code: `api/src/services/otp.service.ts`, `api/src/services/mailer/`, `api/src/services/mailer/adapters/postmark.ts`.

## 1. Postmark account setup

### Create a server and copy the API token

1. Sign in at [postmarkapp.com](https://postmarkapp.com).
2. Open **Servers** → your server (create one if needed, e.g. `oursay-production`).
3. Go to **API Tokens** and copy the **Server API token**.
4. Store it in your deployment secrets as `POSTMARK_SERVER_TOKEN`.

The official Postmark env name is `POSTMARK_SERVER_TOKEN`. `POSTMARK_TOKEN` is still accepted as a legacy alias.

### Verify the sender address

Postmark rejects sends from unverified addresses. OurSay defaults to:

```env
MAILER_FROM=OurSay <no-reply@oursay.ca>
```

Choose **one** of:

| Approach | Postmark UI | Notes |
|----------|-------------|-------|
| **Sender signature** | **Sender Signatures** → add `no-reply@oursay.ca` | Fastest for a single address; confirm via the email Postmark sends. |
| **Domain** | **Domains** → add `oursay.ca` | Recommended for production: verify DKIM and Return-Path so any `@oursay.ca` address can send. |

Until verification completes, API sends fail with a sender-signature error.

### Sandbox mode (new servers)

New Postmark servers start in **sandbox** mode: mail only delivers to addresses you explicitly approve under **Sandbox** settings. That is fine for initial smoke tests. Before launch:

1. Open the server **Settings**.
2. **Disable sandbox mode** when you are ready for real user traffic.

### Message stream

The adapter sends on the default transactional stream **`outbound`**. No extra Postmark configuration is required unless you have renamed or archived that stream.

### Optional (later)

- **Activity** — confirm delivery and diagnose bounces.
- **Webhooks** — delivery / bounce / spam-complaint handlers (not required to send OTP).
- **Templates** — OTP uses an in-app template (`api/src/services/mailer/otp-mail-template.ts`) that produces `subject` / `text` / `html` for every vendor (Postmark, SMTP, SES, noop). Postmark hosted Templates are not required; the adapter forwards `HtmlBody` when `html` is set. Login and registration mails include a continue deep-link from `WEBAUTHN_ORIGIN` (`?otpEmail=`; registration also sets `otpPurpose=registration`). Registration drafts + handle holds live on `auth.email_otp`.

## 2. Configure `@oursay/api` for production

Set these on the API host (repo-root `.env` and/or `api/.env`; package-local overrides root):

```env
# Required in production anyway
SESSION_SECRET=<long-random-secret>

# Postmark credentials
POSTMARK_SERVER_TOKEN=<server-api-token-from-postmark>

# From address — must match a verified sender signature or verified domain
MAILER_FROM=OurSay <no-reply@oursay.ca>

# Route all three OTP flows through Postmark
MAILER_OTP_USE_POSTMARK=true
```

When `MAILER_OTP_USE_POSTMARK=true`, registration, recovery, and login OTP mail all use Postmark. Per-role vendor lists are ignored while this flag is on.

### Advanced: per-role vendor lists

If you need different primary/failover chains per flow, leave `MAILER_OTP_USE_POSTMARK` unset (or `false`) and set comma-separated vendor lists instead:

```env
MAILER_REGISTRATION_VENDORS=postmark
MAILER_RECOVERY_VENDORS=postmark
MAILER_LOGIN_VENDORS=postmark
```

Supported vendors: `postmark`, `smtp`, `ses`, `noop`. Lists are tried **in order** (primary → failover). Example with failover:

```env
MAILER_REGISTRATION_VENDORS=postmark,smtp
```

See [`api/.env.example`](../api/.env.example) for SMTP/SES variables.

### Development (no Postmark)

Default dev config keeps `noop` and prints codes to the console:

```env
MAILER_OTP_USE_POSTMARK=false
MAILER_REGISTRATION_VENDORS=noop
MAILER_RECOVERY_VENDORS=noop
MAILER_LOGIN_VENDORS=noop
```

To exercise real delivery locally, set `MAILER_OTP_USE_POSTMARK=true` and `POSTMARK_SERVER_TOKEN` in repo-root `.env`, then restart the API.

## 3. Verify the integration

### Live smoke test (one email, cached result)

`api/test/32-postmark-otp.spec.ts` sends a single OTP-style message to `test.walk1@oursay.ca` and writes:

`api/test/.output/postmark-otp-send.json`

The test **skips** if that file already exists (avoids repeat API calls). Delete the file to re-run.

```powershell
cd api
npx mocha --grep "postmark: live" test/32-postmark-otp.spec.ts
```

Requires `POSTMARK_SERVER_TOKEN` (or `POSTMARK_TOKEN`) in the environment. The artifact includes the Postmark `messageId` for correlation in **Activity**.

### Manual OTP request

With Postmark enabled and the API running:

```powershell
npm run cli -w @oursay/api -- send-test-otp you@example.com registration
```

Or `POST /v1/auth/otp/request` with `{ "email": "…", "purpose": "registration" }` and check the inbox (and Postmark **Activity**).

### Production checklist

- [ ] `NODE_ENV=production`
- [ ] `SESSION_SECRET` set (no dev default)
- [ ] `POSTMARK_SERVER_TOKEN` set
- [ ] `MAILER_FROM` verified in Postmark
- [ ] `MAILER_OTP_USE_POSTMARK=true` (or per-role `postmark` vendors)
- [ ] Postmark sandbox **disabled**
- [ ] Smoke test or CLI send succeeds; message appears in Postmark Activity
- [ ] OTP codes do **not** appear in application logs (Postmark adapter logs `messageId` only)

## 4. Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `PostmarkMailAdapter requires POSTMARK_SERVER_TOKEN` | Token missing from env |
| Sender signature error from Postmark | `MAILER_FROM` address or domain not verified |
| Mail accepted but not received | Sandbox mode; recipient not on sandbox allowlist |
| OTP still on console, no email | `MAILER_OTP_USE_POSTMARK` still `false` or vendors still `noop` |
| 401 from Postmark API | Wrong or revoked server token |

## Related docs

- [`api/README.md`](../api/README.md) — account API, dev walk, mailer overview
- [`docs/entities/auth/email-otp.md`](./entities/auth/email-otp.md) — OTP entity and purposes
- [`docs/08-IDENTITY-AND-DEVICE-POLICY.md`](./08-IDENTITY-AND-DEVICE-POLICY.md) — when OTP is used vs passkey login
- [Postmark developer docs](https://postmarkapp.com/developer) — API reference, deliverability guides
