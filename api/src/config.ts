// Config for @oursay/api. Mirrors public-record/src/config.ts: load repo-root .env then the
// package-local .env (local overrides root), and export config OBJECTS as constants. No secrets
// are committed — sensitive values are env-only and fail loud in production when unset.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { JurisdictionConfig, PgConfig } from "@oursay/public-record";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");

dotenv.config({ path: join(repoRoot, ".env") });
dotenv.config({ path: join(packageRoot, ".env") });

export const isProduction = process.env.NODE_ENV === "production";

function env(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback;
}

/** A value that must be set explicitly in production; a dev fallback is allowed otherwise. */
function secret(name: string, devFallback: string): string {
  const v = process.env[name]?.trim();
  if (v && v.length > 0) return v;
  if (isProduction) {
    throw new Error(`Missing required secret ${name} (NODE_ENV=production has no committed default).`);
  }
  return devFallback;
}

/**
 * Postgres — the SAME private store @oursay/public-record uses (defaults match its docker-compose).
 * @oursay/api adds its own `auth` schema in this database and FKs `public.users`.
 */
export const pgConfig: PgConfig = {
  host: env("PGHOST", "127.0.0.1"),
  port: Number(env("PGPORT", "5442")),
  user: env("PGUSER", "oursay"),
  password: env("PGPASSWORD", "oursay"),
  database: env("PGDATABASE", "oursay_public_record"),
};

export interface ServerConfig {
  port: number;
  host: string;
}

export const serverConfig: ServerConfig = {
  port: Number(env("PORT", "8080")),
  host: env("HOST", "0.0.0.0"),
};

export interface SessionConfig {
  /** Server-side pepper mixed into OTP + session-token hashes. Env-required in production. */
  secret: string;
  ttlSec: number;
  /** Cookie name for browser clients; the same opaque token also works as a Bearer credential. */
  cookieName: string;
  /** Secure cookie flag — off in dev (http://localhost), on in production. */
  cookieSecure: boolean;
}

export const sessionConfig: SessionConfig = {
  secret: secret("SESSION_SECRET", "dev-insecure-session-pepper-change-me"),
  ttlSec: Number(env("SESSION_TTL_SEC", String(60 * 60 * 24 * 30))),
  cookieName: env("SESSION_COOKIE_NAME", "oursay_session"),
  cookieSecure: env("SESSION_COOKIE_SECURE", isProduction ? "true" : "false") === "true",
};

export interface OtpConfig {
  length: number;
  ttlSec: number;
  maxAttempts: number;
  /** Per-email OTP requests allowed within the rolling window. */
  requestsPerWindow: number;
  /** Per-IP OTP requests allowed within the rolling window. */
  requestsPerIpPerWindow: number;
  windowSec: number;
}

export const otpConfig: OtpConfig = {
  length: Number(env("OTP_LENGTH", "6")),
  ttlSec: Number(env("OTP_TTL_SEC", "600")),
  maxAttempts: Number(env("OTP_MAX_ATTEMPTS", "5")),
  requestsPerWindow: Number(env("RL_OTP_REQUEST_PER_HOUR", "5")),
  requestsPerIpPerWindow: Number(env("RL_OTP_REQUEST_PER_IP_PER_HOUR", "20")),
  windowSec: Number(env("RL_OTP_WINDOW_SEC", "3600")),
};

export interface RegistrationConfig {
  minAgeYears: number;
}

export const registrationConfig: RegistrationConfig = {
  minAgeYears: Number(env("MIN_AGE_YEARS", "18")),
};

export type GeocodeProviderName = "stub" | "geocodio" | "nominatim";

export interface GeocodeConfig {
  /** Provider selection: 'stub' (default; deterministic, no network) | 'geocodio' (real, API-key gated).
   *  'nominatim' is a reserved slot that is NOT implemented (fails fast in the factory). */
  provider: GeocodeProviderName;
  /** API key for a keyed provider (geocodio). Env-required in production only when that provider is used;
   *  unused by the stub. */
  apiKey: string;
  /** Per-request timeout (ms) for a network provider. */
  timeoutMs: number;
  /** Reserved base URL for a future self-hosted Nominatim (see api/README.md § Geocoding). */
  nominatimUrl: string;
}

/**
 * Address geocoding (docs/REGION-MODEL.md). Best-effort, structural resolvability — NOT KYC residency.
 * Defaults to the offline stub so a fresh clone + CI need no API key or network. The derived point is
 * PRIVATE PII (auth.profile_geocodes) and never leaves the service layer.
 */
export const geocodeConfig: GeocodeConfig = {
  provider: env("GEOCODE_PROVIDER", "stub") as GeocodeProviderName,
  apiKey: env("GEOCODE_API_KEY", ""),
  timeoutMs: Number(env("GEOCODE_TIMEOUT_MS", "5000")),
  nominatimUrl: env("GEOCODE_NOMINATIM_URL", ""),
};

export type KycProviderName = "stub" | "equifax";

export interface KycConfig {
  /** Provider selection: 'stub' (default; deterministic, no network, awards the requested tier).
   *  'equifax' is a reserved slot that is NOT implemented (fails fast in the factory). */
  provider: KycProviderName;
}

/**
 * KYC verification provider (docs/01 §4–5). Defaults to the offline stub so a fresh clone + CI need no
 * vendor account: the stub awards the requested tier into public.kyc_attestations (platform-trust, R26).
 * The awarded tier is read newest-first by recovery and the public count filter; no PII reaches the row.
 */
export const kycConfig: KycConfig = {
  provider: env("KYC_PROVIDER", "stub") as KycProviderName,
};

export interface CivicConfig {
  /** The platform's P-256 binding key (hex) — signs each per-thread registration binding. */
  platformBindingPrivKeyHex: string;
  /** Reject a signed envelope at submit when `serverNow - createdAt` exceeds this many seconds; `0` disables. */
  signedEnvelopeMaxAgeSec: number;
  /** Ledger partition id for the civic `PublicChain` (one chain per jurisdiction at launch). */
  chainId: string;
}

/**
 * Civic record engine config (docs/08 §6). The platform signs each thread registration binding with a
 * P-256 key: env-required in production (VALUES §9 — no committed secrets), with a deterministic
 * INSECURE dev fallback so a fresh clone runs without setup; tests inject an ephemeral key. The same
 * key verifies bindings at submit (the civic RecordService derives its public key from it). The civic
 * RecordService is ALWAYS built with requireDeviceSigner=true — the HTTP path never accepts a
 * persona-only/unsigned dev append.
 */
const DEV_PLATFORM_BINDING_PRIVKEY = "de".repeat(32); // clearly-insecure local-dev scalar; never prod.

export const civicConfig: CivicConfig = {
  platformBindingPrivKeyHex: secret("PLATFORM_BINDING_PRIVKEY", DEV_PLATFORM_BINDING_PRIVKEY),
  signedEnvelopeMaxAgeSec: Number(env("SIGNED_ENVELOPE_MAX_AGE_SEC", "120")),
  chainId: env("CHAIN_ID", "ab-ca-gov"),
};

/**
 * The Alberta launch JURISDICTION (docs/GLOSSARY, docs/08 §6.0) — a provincial deployment. Default
 * governance is FINAL-action: votes and signatures are final (`allowChange`/`allowRevoke` off) unless
 * an entity opts in within its own rules. Generic by design (VALUES §7) — every field is
 * env-overridable config, never hardcoded platform logic. Product label mapping is presentational
 * (front-end), not stored on the record: a `post` is surfaced as a "Belief" in the Alberta product.
 *
 * NOTE: this is NOT the source of truth for per-jurisdiction rules — those live in
 * `@oursay/jurisdiction-data`, which the container registers for every jurisdiction. This object only
 * (a) selects the deployment DEFAULT id via `JURISDICTION_ID`, and (b) acts as the registry FALLBACK
 * when that id is not shipped by the data package. It intentionally carries no `counts` policy.
 */
export const jurisdictionConfig: JurisdictionConfig = {
  id: env("JURISDICTION_ID", "ab-ca-gov"),
  level: env("JURISDICTION_LEVEL", "provincial"),
  rules: {
    allowChange: env("JURISDICTION_ALLOW_CHANGE", "false") === "true",
    allowRevoke: env("JURISDICTION_ALLOW_REVOKE", "false") === "true",
  },
  // A deployment may RAISE this jurisdiction's k-anonymity floor above the platform default; the
  // read service resolves max(platformMin, this ?? platformDefault), so a too-low value never weakens
  // it. Unset by default (uses the platform default).
  ...(process.env.JURISDICTION_K_ANONYMITY_FLOOR
    ? { privacy: { kAnonymityFloor: Number(env("JURISDICTION_K_ANONYMITY_FLOOR", "0")) } }
    : {}),
};

/**
 * Public-count k-anonymity policy (docs/06 §3). When a public count is narrowed by a geo (or, later,
 * tier) filter, buckets with `0 < count < effectiveK` are suppressed so a small area×tier slice can't
 * isolate an individual. `effectiveK = max(min, jurisdictionFloor ?? default)`. Read LIVE from env on
 * every request (not frozen at construction) so deployments — and the singleton test World — can tune
 * it without a rebuild. Defaults 5/5 (docs/06 minimum-aggregation); dev disables with MIN=0/DEFAULT=0.
 */
export function publicCountsKAnon(): { min: number; default: number } {
  return {
    min: Number(env("PUBLIC_COUNTS_K_ANONYMITY_MIN", "5")),
    default: Number(env("PUBLIC_COUNTS_K_ANONYMITY_DEFAULT", "5")),
  };
}

export interface WebAuthnConfig {
  rpID: string;
  rpName: string;
  origin: string;
  /** Require the authenticator's user-verification flag (biometric/PIN). Forced on in production;
   *  in dev/test it defaults on but may be disabled via WEBAUTHN_REQUIRE_UV=false. */
  requireUserVerification: boolean;
}

export const webauthnConfig: WebAuthnConfig = {
  rpID: env("WEBAUTHN_RP_ID", "localhost"),
  rpName: env("WEBAUTHN_RP_NAME", "OurSay"),
  origin: env("WEBAUTHN_ORIGIN", "http://localhost:8080"),
  requireUserVerification: isProduction ? true : env("WEBAUTHN_REQUIRE_UV", "true") === "true",
};

export type MailerVendor = "postmark" | "smtp" | "ses" | "noop";

export interface MailerConfig {
  from: string;
  /** Ordered adapters per role (primary → failover). Comma-separated env values. */
  roles: Record<"registration" | "recovery" | "login", MailerVendor[]>;
  postmark: { token: string };
  smtp: { host: string; port: number; user: string; pass: string; secure: boolean };
  ses: { region: string };
}

function vendors(raw: string): MailerVendor[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is MailerVendor => s === "postmark" || s === "smtp" || s === "ses" || s === "noop");
}

export const mailerConfig: MailerConfig = {
  from: env("MAILER_FROM", "OurSay <no-reply@oursay.ca>"),
  roles: {
    registration: vendors(env("MAILER_REGISTRATION_VENDORS", "noop")),
    recovery: vendors(env("MAILER_RECOVERY_VENDORS", "noop")),
    login: vendors(env("MAILER_LOGIN_VENDORS", "noop")),
  },
  postmark: { token: env("POSTMARK_TOKEN", "") },
  smtp: {
    host: env("SMTP_HOST", ""),
    port: Number(env("SMTP_PORT", "587")),
    user: env("SMTP_USER", ""),
    pass: env("SMTP_PASS", ""),
    secure: env("SMTP_SECURE", "false") === "true",
  },
  ses: { region: env("SES_REGION", "us-east-1") },
};

export const paths = { packageRoot, repoRoot };
