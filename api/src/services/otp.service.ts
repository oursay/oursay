// OtpService: issue + verify email one-time codes, with hashing, rate limiting, and pluggable
// mailing. Codes are generated here, hashed before storage, and emailed via the role-based mailer.
// The plaintext code is held only long enough to send it — never persisted, returned, or logged.
// Registration requests may attach reserved_handle + profile_json for cross-session verify.

import { randomUUID } from "node:crypto";
import type { OtpConfig } from "../config.js";
import { ServiceError, systemNow, type Now } from "../errors.js";
import { expiryFrom, generateOtp, hashOtp, hexEqual, newOtpSalt } from "../helpers/otp.js";
import { isPlausibleEmail, normalizeEmail } from "../helpers/email.js";
import type { OtpPurpose, OtpRepo, RegistrationOtpDraft } from "../repo/otp.repo.js";
import type { RateLimitRepo } from "../repo/ratelimit.repo.js";
import type { MailerService, MailRole } from "./mailer/mailer.js";
import { buildOtpMailTemplate, otpContinueUrl } from "./mailer/otp-mail-template.js";

export interface OtpServiceDeps {
  otpRepo: OtpRepo;
  rateLimitRepo: RateLimitRepo;
  mailer: MailerService;
  config: OtpConfig;
  /** Server-side pepper (sessionConfig.secret). */
  pepper: string;
  /**
   * Public web-app origin used to build OTP deep-links (`?otpEmail=` / `otpPurpose=`).
   * Leave unset/empty to omit the link.
   */
  appOrigin?: string;
  now?: Now;
}

export interface VerifiedEmail {
  email: string;
  emailCanonical: string;
  /** Registration draft captured at OTP request (when present). */
  registrationDraft?: RegistrationOtpDraft | null;
}

/** Result of issuing an OTP. `expiresAt` is ISO-8601 (UTC) — the code is invalid after this instant. */
export interface OtpRequestResult extends VerifiedEmail {
  expiresAt: string;
}

export interface OtpRequestInput {
  emailRaw: string;
  purpose: OtpPurpose;
  ip?: string | null;
  /** Required for registration when no prior active draft exists for this email. */
  registrationDraft?: RegistrationOtpDraft | null;
}

const ROLE: Record<OtpPurpose, MailRole> = {
  registration: "registration",
  recovery: "recovery",
  login: "login",
};

export class OtpService {
  private readonly now: Now;
  constructor(private readonly d: OtpServiceDeps) {
    this.now = d.now ?? systemNow;
  }

  /** Generate, store (hashed), and email a code. Rate-limited per email and per IP. */
  async request(input: OtpRequestInput): Promise<OtpRequestResult> {
    if (!isPlausibleEmail(input.emailRaw)) {
      throw new ServiceError("validation", "A valid email address is required");
    }
    const { email, canonical } = normalizeEmail(input.emailRaw);
    const now = this.now();

    await this.enforceRateLimit(canonical, input.ip ?? null, now);

    const draft =
      input.purpose === "registration" ? (input.registrationDraft ?? null) : null;
    const reservedHandle = draft?.handle ?? null;

    if (input.purpose === "registration" && (!draft || !reservedHandle)) {
      throw new ServiceError("validation", "A registration profile is required to request a code");
    }

    const code = generateOtp(this.d.config.length);
    const salt = newOtpSalt();
    const codeHash = hashOtp({ pepper: this.d.pepper, emailCanonical: canonical, code, salt });

    await this.d.otpRepo.consumeOutstanding(canonical, input.purpose);
    const expiresAt = expiryFrom(now, this.d.config.ttlSec);
    await this.d.otpRepo.insert({
      id: randomUUID(),
      emailCanonical: canonical,
      codeHash,
      salt,
      purpose: input.purpose,
      expiresAt,
      reservedHandle,
      profileJson: draft,
    });

    const minutes = Math.round(this.d.config.ttlSec / 60);
    const continueUrl =
      this.d.appOrigin && (input.purpose === "login" || input.purpose === "registration")
        ? otpContinueUrl(this.d.appOrigin, email, input.purpose)
        : undefined;
    const mail = buildOtpMailTemplate({
      purpose: input.purpose,
      code,
      expiresInMinutes: minutes,
      continueUrl,
    });
    await this.d.mailer.send(ROLE[input.purpose], {
      to: email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    return { email, emailCanonical: canonical, expiresAt: expiresAt.toISOString() };
  }

  /** True if an active (unconsumed, unexpired) code exists for this (email, purpose). Used to gate
   *  the login (re)send on an already-open window without leaking whether the account exists. */
  async hasActive(emailCanonical: string, purpose: OtpPurpose): Promise<boolean> {
    return (await this.d.otpRepo.getLatestActive(emailCanonical, purpose)) != null;
  }

  /** Peek the latest active OTP without consuming it (e.g. to read a registration draft). */
  async peekActive(emailCanonical: string, purpose: OtpPurpose) {
    return this.d.otpRepo.getLatestActive(emailCanonical, purpose);
  }

  /** Release expired registration handle holds (call before contending for a reserved handle). */
  async releaseExpiredRegistrationHolds(): Promise<void> {
    await this.d.otpRepo.consumeExpiredRegistrationHolds();
  }

  /** Email holding an active registration reservation for this wire handle, if any. */
  async activeRegistrationHolder(reservedHandle: string): Promise<string | null> {
    return this.d.otpRepo.getActiveRegistrationHolder(reservedHandle);
  }

  /** Verify a presented code; consumes it on success. Throws on invalid/expired/too-many-attempts. */
  async verify(input: { emailRaw: string; code: string; purpose: OtpPurpose }): Promise<VerifiedEmail> {
    const { email, canonical } = normalizeEmail(input.emailRaw);
    const rec = await this.d.otpRepo.getLatestActive(canonical, input.purpose);
    if (!rec) throw new ServiceError("otp_invalid", "Invalid or expired code");

    const attempts = await this.d.otpRepo.incrementAttempts(rec.id);
    if (attempts > this.d.config.maxAttempts) {
      await this.d.otpRepo.consume(rec.id);
      throw new ServiceError("otp_max_attempts", "Too many attempts; request a new code");
    }

    const presented = hashOtp({ pepper: this.d.pepper, emailCanonical: canonical, code: input.code, salt: rec.salt });
    if (!hexEqual(presented, rec.codeHash)) {
      throw new ServiceError("otp_invalid", "Invalid or expired code");
    }

    await this.d.otpRepo.consume(rec.id);
    return {
      email,
      emailCanonical: canonical,
      registrationDraft: rec.profileJson,
    };
  }

  private async enforceRateLimit(emailCanonical: string, ip: string | null, now: Date): Promise<void> {
    const w = this.d.config.windowSec;
    const emailCount = await this.d.rateLimitRepo.hit(`email:${emailCanonical}`, now, w);
    if (emailCount > this.d.config.requestsPerWindow) {
      throw new ServiceError("rate_limited", "Too many codes requested for this email; try again later");
    }
    if (ip) {
      const ipCount = await this.d.rateLimitRepo.hit(`ip:${ip}`, now, w);
      if (ipCount > this.d.config.requestsPerIpPerWindow) {
        throw new ServiceError("rate_limited", "Too many codes requested; try again later");
      }
    }
  }
}
