// Config for @oursay/api. Mirrors public-record/src/config.ts: load repo-root .env then the
// package-local .env (local overrides root), and export config OBJECTS as constants. No secrets
// are committed — sensitive values are env-only and fail loud in production when unset.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { PgConfig } from "@oursay/public-record";

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
  roles: Record<"registration" | "recovery", MailerVendor[]>;
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
