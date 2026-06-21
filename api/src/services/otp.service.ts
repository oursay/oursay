// OtpService: issue + verify email one-time codes, with hashing, rate limiting, and pluggable
// mailing. Codes are generated here, hashed before storage, and emailed via the role-based mailer.
// The plaintext code is held only long enough to send it — never persisted, returned, or logged.

import { randomUUID } from "node:crypto";
import type { OtpConfig } from "../config.js";
import { ServiceError, systemNow, type Now } from "../errors.js";
import { expiryFrom, generateOtp, hashOtp, hexEqual, newOtpSalt } from "../helpers/otp.js";
import { isPlausibleEmail, normalizeEmail } from "../helpers/email.js";
import type { OtpPurpose, OtpRepo } from "../repo/otp.repo.js";
import type { RateLimitRepo } from "../repo/ratelimit.repo.js";
import type { MailerService, MailRole } from "./mailer/mailer.js";

export interface OtpServiceDeps {
  otpRepo: OtpRepo;
  rateLimitRepo: RateLimitRepo;
  mailer: MailerService;
  config: OtpConfig;
  /** Server-side pepper (sessionConfig.secret). */
  pepper: string;
  now?: Now;
}

export interface VerifiedEmail {
  email: string;
  emailCanonical: string;
}

/** Result of issuing an OTP. `expiresAt` is ISO-8601 (UTC) — the code is invalid after this instant. */
export interface OtpRequestResult extends VerifiedEmail {
  expiresAt: string;
}

const ROLE: Record<OtpPurpose, MailRole> = { registration: "registration", recovery: "recovery" };

export class OtpService {
  private readonly now: Now;
  constructor(private readonly d: OtpServiceDeps) {
    this.now = d.now ?? systemNow;
  }

  /** Generate, store (hashed), and email a code. Rate-limited per email and per IP. */
  async request(input: { emailRaw: string; purpose: OtpPurpose; ip?: string | null }): Promise<OtpRequestResult> {
    if (!isPlausibleEmail(input.emailRaw)) {
      throw new ServiceError("validation", "A valid email address is required");
    }
    const { email, canonical } = normalizeEmail(input.emailRaw);
    const now = this.now();

    await this.enforceRateLimit(canonical, input.ip ?? null, now);

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
    });

    const minutes = Math.round(this.d.config.ttlSec / 60);
    await this.d.mailer.send(ROLE[input.purpose], {
      to: email,
      subject: input.purpose === "registration" ? "Your OurSay verification code" : "Your OurSay recovery code",
      text:
        `Your OurSay ${input.purpose === "registration" ? "verification" : "recovery"} code is:\n\n` +
        `${code}\n\nIt expires in ${minutes} minutes. If you didn't request this, you can ignore this email.`,
    });

    return { email, emailCanonical: canonical, expiresAt: expiresAt.toISOString() };
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
    return { email, emailCanonical: canonical };
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
