// DDL for the @oursay/api `auth` schema: account PII (profiles), account-login WebAuthn
// credentials, opaque DB-backed sessions, email OTP, and OTP rate-limit buckets.
//
// This lives in the SAME Postgres database as @oursay/public-record and FKs `public.users(id)`.
// `public.users` (+ `public.kyc_attestations`) must already exist — @oursay/api applies
// PrivateStore's base schema first (see db.ts). Idempotent: safe to run on every boot.
//
// IMPORTANT: `auth.passkey_credentials` is the ACCOUNT-LOGIN factor (proves who is logged in). It
// is deliberately SEPARATE from public-record's civic `device_keys` / `thread_signers` (which sign
// civic actions per docs/08 §2). The login passkey never signs the public record.

export const AUTH_DDL = `
CREATE SCHEMA IF NOT EXISTS auth;

-- Private account profile / PII. Public-facing name (handle / display_name) is NOT here — it lives on
-- public.users. The user's LEGAL name (first_name / last_name) IS here: private PII, used for KYC,
-- never publicly surfaced. Address is stored as Canada-centric components (province, postal_code,
-- country default 'CA'); jurisdiction-specific DISPLAY labels live in the front-end (and a future
-- jurisdiction table), not in column names. No district binding is persisted (boundaries shift over
-- time; district/region membership is resolved dynamically against platform-defined boundaries).
-- Encryption-at-rest is a follow-on (KMS); these columns are the extension point.
CREATE TABLE IF NOT EXISTS auth.profiles (
  user_id         UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  first_name      TEXT,                 -- private PII (KYC); never public
  last_name       TEXT,                 -- private PII (KYC); never public
  address_line1   TEXT,
  address_line2   TEXT,
  city            TEXT,
  province        TEXT,                 -- province/territory (Canada-centric; FE owns the label)
  postal_code     TEXT,
  country         TEXT NOT NULL DEFAULT 'CA',
  address_memo    TEXT,                 -- jurisdiction-specific extra field
  birthdate       DATE NOT NULL,        -- age gate enforced at registration (service layer)
  email           TEXT NOT NULL,        -- as the user typed it
  email_canonical TEXT NOT NULL UNIQUE, -- normalized; uniqueness + all lookups use this form
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotent migrations for a persistent dev DB created before these columns existed.
ALTER TABLE auth.profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE auth.profiles ADD COLUMN IF NOT EXISTS last_name TEXT;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'auth' AND table_name = 'profiles' AND column_name = 'region')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'auth' AND table_name = 'profiles' AND column_name = 'province') THEN
    ALTER TABLE auth.profiles RENAME COLUMN region TO province;
  END IF;
END $$;
DROP INDEX IF EXISTS auth.profiles_region;
-- Coarse geographic narrowing only (never the full street address in query predicates).
CREATE INDEX IF NOT EXISTS profiles_province ON auth.profiles (province);
CREATE INDEX IF NOT EXISTS profiles_postal ON auth.profiles (postal_code);

-- Account-login WebAuthn credentials (passkey-primary auth). NOT civic signing keys.
CREATE TABLE IF NOT EXISTS auth.passkey_credentials (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,           -- base64url credential id
  public_key    BYTEA NOT NULL,                 -- COSE public key bytes
  counter       BIGINT NOT NULL DEFAULT 0,      -- signature counter (clone detection)
  transports    TEXT,                           -- CSV (e.g. "internal,hybrid")
  aaguid        TEXT,
  label         TEXT,                           -- optional human label
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS passkey_credentials_user ON auth.passkey_credentials (user_id);

-- Short-lived WebAuthn ceremony challenges (register + login). Consumed once, expired on TTL.
CREATE TABLE IF NOT EXISTS auth.webauthn_challenges (
  id              UUID PRIMARY KEY,
  user_id         UUID REFERENCES public.users(id) ON DELETE CASCADE, -- nullable (usernameless login)
  email_canonical TEXT,                          -- set for login-by-email
  challenge       TEXT NOT NULL,                 -- base64url
  purpose         TEXT NOT NULL CHECK (purpose IN ('register','login')),
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webauthn_challenges_lookup ON auth.webauthn_challenges (challenge);

-- Opaque DB-backed sessions. The token itself is never stored — only its hash. Non-'full' scopes are
-- limited sessions that may re-enroll a passkey but not perform full actions:
--   'recovery' — issued by recovery OTP (lost passkey); recovery REVOKES all prior sessions.
--   'login'    — issued by the gated cross-device login OTP (docs/08); enroll-only until the new
--                device enrolls a passkey and logs in with it. Login does NOT revoke other sessions.
CREATE TABLE IF NOT EXISTS auth.sessions (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  scope       TEXT NOT NULL DEFAULT 'full' CHECK (scope IN ('full','recovery','login')),
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_user ON auth.sessions (user_id);
-- Widen the scope CHECK on a persistent dev DB created before 'login' existed (constraint is the
-- table-name-derived auto name). Idempotent: drop then re-add the current allow-list.
ALTER TABLE auth.sessions DROP CONSTRAINT IF EXISTS sessions_scope_check;
ALTER TABLE auth.sessions ADD CONSTRAINT sessions_scope_check CHECK (scope IN ('full','recovery','login'));

-- Email OTP for the three purposes (docs/08): 'registration' (bootstrap), 'recovery' (lost passkey),
-- and 'login' (gated cross-device sign-in — only sent after a trusted device opens the window). Codes
-- are stored hashed (pepper + per-row salt); the plaintext code is never persisted or logged. The
-- active 'login' row IS the login enable window (TTL = OTP_TTL_SEC; one active per (email,purpose)).
CREATE TABLE IF NOT EXISTS auth.email_otp (
  id              UUID PRIMARY KEY,
  email_canonical TEXT NOT NULL,
  code_hash       TEXT NOT NULL,
  salt            TEXT NOT NULL,
  purpose         TEXT NOT NULL CHECK (purpose IN ('registration','recovery','login')),
  attempts        INT  NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_otp_lookup ON auth.email_otp (email_canonical, purpose);
-- Widen the purpose CHECK on a persistent dev DB created before 'login' existed.
ALTER TABLE auth.email_otp DROP CONSTRAINT IF EXISTS email_otp_purpose_check;
ALTER TABLE auth.email_otp ADD CONSTRAINT email_otp_purpose_check CHECK (purpose IN ('registration','recovery','login'));

-- Rolling-window rate-limit counters, keyed by bucket (e.g. "email:<canonical>" / "ip:<addr>").
-- Enforced in OtpService so the CLI/service path is throttled too, not just HTTP.
CREATE TABLE IF NOT EXISTS auth.otp_rate_limits (
  bucket_key   TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);
`;
