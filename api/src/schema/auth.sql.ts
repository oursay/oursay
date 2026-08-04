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
  over_18         BOOLEAN NOT NULL DEFAULT false, -- self-attested at registration; KYC re-verifies.
                                        -- The age gate stores ONLY this boolean — no date of birth
                                        -- is retained ([code-over-18], C3).
  visibility      TEXT NOT NULL DEFAULT 'anonymous',
                                        -- account-default author visibility (C4; docs/09) — the FULL
                                        -- web-app enum; CHECK is (re)applied below so the allow-list
                                        -- can widen idempotently. Effective value cascades
                                        -- thread ?? account ?? anonymous.
  email           TEXT NOT NULL,        -- as the user typed it
  email_canonical TEXT NOT NULL UNIQUE, -- normalized; uniqueness + all lookups use this form
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotent migrations for a persistent dev DB created before these columns existed.
ALTER TABLE auth.profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE auth.profiles ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE auth.profiles ADD COLUMN IF NOT EXISTS over_18 BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE auth.profiles ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'anonymous';
-- [align-w4-api-surface] C4: the visibility enum widens to the full web-app set. Migrate the legacy
-- 'officials' spelling forward, then (re)apply the widened allow-list (drop + re-add is the
-- idempotent CHECK-widening pattern used for sessions/email_otp above).
UPDATE auth.profiles SET visibility = 'all_officials' WHERE visibility = 'officials';
ALTER TABLE auth.profiles DROP CONSTRAINT IF EXISTS profiles_visibility_check;
ALTER TABLE auth.profiles ADD CONSTRAINT profiles_visibility_check
  CHECK (visibility IN ('anonymous','my_officials','all_officials','my_district','my_jurisdiction','id_verified','public'));
-- [code-over-18]: the stored date of birth is DISCARDED. Rows that predate the boolean carry a
-- birthdate that passed the 18+ registration gate — mark them over_18 before dropping the column.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'auth' AND table_name = 'profiles' AND column_name = 'birthdate') THEN
    UPDATE auth.profiles SET over_18 = true;
    ALTER TABLE auth.profiles DROP COLUMN birthdate;
  END IF;
END $$;
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
--   'recovery'     — issued by recovery OTP (lost passkey); recovery REVOKES all prior sessions.
--   'login'        — issued by the gated cross-device login OTP (docs/08); enroll-only until the new
--                    device enrolls a passkey and logs in with it. Login does NOT revoke other sessions.
--   'recovery_kyc' — verified-account recovery after email OTP; biometric Didit only (no passkey enroll).
-- credential_id pairs a session to the account-login passkey that established it (passkey login only;
-- NULL for OTP registration/recovery/login sessions). Revoking that passkey (kick a device) revokes
-- its sessions. ON DELETE SET NULL so removing the credential never orphans the FK.
CREATE TABLE IF NOT EXISTS auth.sessions (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  scope         TEXT NOT NULL DEFAULT 'full' CHECK (scope IN ('full','registration','recovery','login','recovery_kyc')),
  credential_id UUID REFERENCES auth.passkey_credentials(id) ON DELETE SET NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_user ON auth.sessions (user_id);
-- Widen the scope CHECK on a persistent dev DB created before later scopes existed
-- (constraint is the table-name-derived auto name). Idempotent: drop then re-add the allow-list.
ALTER TABLE auth.sessions DROP CONSTRAINT IF EXISTS sessions_scope_check;
ALTER TABLE auth.sessions ADD CONSTRAINT sessions_scope_check
  CHECK (scope IN ('full','registration','recovery','login','recovery_kyc'));
-- Add the passkey pairing column on a persistent dev DB created before it existed (BEFORE the index
-- below, which depends on it).
ALTER TABLE auth.sessions ADD COLUMN IF NOT EXISTS credential_id UUID REFERENCES auth.passkey_credentials(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sessions_credential ON auth.sessions (credential_id);

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
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Registration draft: handle hold + profile captured at OTP request (cross-session verify).
  reserved_handle TEXT,
  profile_json    JSONB
);
CREATE INDEX IF NOT EXISTS email_otp_lookup ON auth.email_otp (email_canonical, purpose);
-- Widen the purpose CHECK on a persistent dev DB created before 'login' existed.
ALTER TABLE auth.email_otp DROP CONSTRAINT IF EXISTS email_otp_purpose_check;
ALTER TABLE auth.email_otp ADD CONSTRAINT email_otp_purpose_check CHECK (purpose IN ('registration','recovery','login'));
-- Idempotent columns for persistent DBs created before registration drafts existed.
ALTER TABLE auth.email_otp ADD COLUMN IF NOT EXISTS reserved_handle TEXT;
ALTER TABLE auth.email_otp ADD COLUMN IF NOT EXISTS profile_json JSONB;
-- One active (unconsumed) registration hold per handle. Expired rows are released via
-- consumeExpiredRegistrationHolds before a new request contends for the name.
CREATE UNIQUE INDEX IF NOT EXISTS email_otp_reserved_handle_active
  ON auth.email_otp (reserved_handle)
  WHERE purpose = 'registration'
    AND consumed_at IS NULL
    AND reserved_handle IS NOT NULL;

-- Rolling-window rate-limit counters, keyed by bucket (e.g. "email:<canonical>" / "ip:<addr>").
-- Enforced in OtpService so the CLI/service path is throttled too, not just HTTP.
CREATE TABLE IF NOT EXISTS auth.otp_rate_limits (
  bucket_key   TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

-- Private geocode point cache (PRIVATE PII — same tier as auth.profiles; NEVER on any HTTP response,
-- OpenAPI schema, or log). This is structural resolvability ("does this address resolve to a point?"),
-- NOT KYC residency and NOT a district binding — no district/region id is ever stored here. The point
-- is a future input to point-in-polygon Region resolution (docs/REGION-MODEL.md). Geocoding is
-- best-effort: registration never fails because of it. Requires the PostGIS extension, which
-- GeoStore.init() enables before this DDL runs (see db.ts).
--
-- CURRENT cache: at most one row per user — the point as of now. Upserted on a successful geocode;
-- the row is cleared only when the address falls below the attempt gate or leaves Canada.
CREATE TABLE IF NOT EXISTS auth.profile_geocodes (
  user_id      UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  address_hash TEXT NOT NULL,                    -- sha256 of normalized address fields; invalidation key
  geom         geometry(Point, 4326) NOT NULL,   -- derived point; private
  provider     TEXT NOT NULL,                    -- 'stub' | 'geocodio'
  confidence   REAL,                             -- provider-reported confidence/accuracy (nullable)
  geocoded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profile_geocodes_geom_gix ON auth.profile_geocodes USING GIST (geom);

-- APPEND-ONLY history: every distinct address->point a user has ever resolved to. Never deleted in
-- normal operation (clearing the CURRENT cache above does not touch this). Composite PK dedupes by
-- (user, address) so re-geocoding the same address is a no-op; supports future "ever in region" filters.
CREATE TABLE IF NOT EXISTS auth.profile_geocode_history (
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  address_hash TEXT NOT NULL,
  geom         geometry(Point, 4326) NOT NULL,
  provider     TEXT NOT NULL,
  confidence   REAL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, address_hash)
);
CREATE INDEX IF NOT EXISTS profile_geocode_history_geom_gix ON auth.profile_geocode_history USING GIST (geom);
CREATE INDEX IF NOT EXISTS profile_geocode_history_user_time_idx ON auth.profile_geocode_history (user_id, recorded_at);

-- ── [align-w3-gates-schema] account-scoped tables (WEB-APP-GAPS Part 2) ──────────────────────────

-- Jurisdiction subscriptions ([mvp-c10b-membership]); every account is auto-subscribed to
-- oursay-global at registration. 'role' is the platform-assigned, revocable authority role
-- ('official' today; never a KYC tier — Part 5 #7). 'represented_district_slug' is set with the
-- role: an official's in-district logic is forced to the REPRESENTED district, never the home
-- address (Part 6 #5).
CREATE TABLE IF NOT EXISTS auth.jurisdiction_memberships (
  user_id                   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  jurisdiction_id           TEXT NOT NULL,
  role                      TEXT CHECK (role IN ('official')),
  represented_district_slug TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, jurisdiction_id)
);
CREATE INDEX IF NOT EXISTS jurisdiction_memberships_jur ON auth.jurisdiction_memberships (jurisdiction_id);

-- Platform-scoped account roles ([v1-a-admin-role]). Orthogonal to KYC tiers AND to the
-- jurisdiction-scoped Official role on auth.jurisdiction_memberships.
--
-- REJECTED: do NOT overload auth.jurisdiction_memberships with a synthetic jurisdiction_id =
-- 'platform' row. Platform roles are platform-wide (no seat, no jurisdiction), while Official is
-- jurisdiction- and seat-scoped; mixing them corrupts Official gates, geo, and me-route retention.
--
-- Anticipated role names (CHECK lists them for future widening; ONLY admin has behavior today):
--   admin, dev, mod, auditor, support
-- Bootstrap: the first admin grant may have granted_by_admin_id IS NULL (CLI / SSH elevate).
CREATE TABLE IF NOT EXISTS auth.account_roles (
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role                TEXT NOT NULL,
  granted_by_admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  granted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);
CREATE INDEX IF NOT EXISTS account_roles_role_idx ON auth.account_roles (role);
ALTER TABLE auth.account_roles DROP CONSTRAINT IF EXISTS account_roles_role_check;
ALTER TABLE auth.account_roles ADD CONSTRAINT account_roles_role_check
  CHECK (role IN ('admin', 'dev', 'mod', 'auditor', 'support'));

-- C1: per-action signing preferences (quick | ask | passkey per SignAction). The gate floor is
-- enforced server-side regardless; prefs only pick the method ABOVE the floor. JSONB keeps the
-- action keyset a client concern (e.g. { "post": "ask", "vote": "passkey" }).
CREATE TABLE IF NOT EXISTS auth.signing_prefs (
  user_id    UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  prefs      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- C4: optional per-jurisdiction visibility layer (kept per docs/09; no UI yet — the MVP cascade is
-- thread ?? account ?? anonymous, this middle layer is future MAY).
CREATE TABLE IF NOT EXISTS auth.visibility_overrides (
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  jurisdiction_id TEXT NOT NULL,
  visibility      TEXT NOT NULL,
  PRIMARY KEY (user_id, jurisdiction_id)
);
-- [align-w4-api-surface] C4: widen to the full web-app enum (same pattern as auth.profiles above).
UPDATE auth.visibility_overrides SET visibility = 'all_officials' WHERE visibility = 'officials';
ALTER TABLE auth.visibility_overrides DROP CONSTRAINT IF EXISTS visibility_overrides_visibility_check;
ALTER TABLE auth.visibility_overrides ADD CONSTRAINT visibility_overrides_visibility_check
  CHECK (visibility IN ('anonymous','my_officials','all_officials','my_district','my_jurisdiction','id_verified','public'));

-- Hosted KYC session tracking (Didit). No decision payload — vendor PII stays at the provider.
CREATE TABLE IF NOT EXISTS auth.kyc_sessions (
  id                   UUID PRIMARY KEY,
  user_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider             TEXT NOT NULL,
  provider_session_id  TEXT NOT NULL UNIQUE,
  workflow_kind        TEXT NOT NULL CHECK (workflow_kind IN ('identity', 'poa', 'recovery')),
  status               TEXT NOT NULL,
  attested_at          TIMESTAMPTZ,
  last_polled_at       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kyc_sessions_user ON auth.kyc_sessions (user_id);

-- Expand workflow_kind for DBs that already had the identity|poa-only CHECK.
ALTER TABLE auth.kyc_sessions DROP CONSTRAINT IF EXISTS kyc_sessions_workflow_kind_check;
ALTER TABLE auth.kyc_sessions ADD CONSTRAINT kyc_sessions_workflow_kind_check
  CHECK (workflow_kind IN ('identity', 'poa', 'recovery'));
`;
