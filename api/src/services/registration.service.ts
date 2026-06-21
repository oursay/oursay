// RegistrationService: the bootstrap path. Verify the email OTP, enforce the age gate, then create
// the account (public.users) + private profile (auth.profiles) and issue a session.
//
// The display name is written to public.users.handle (single source of truth). The age gate lives
// HERE (not in HTTP): minimum age is computed from DOB against the injected clock.

import { randomUUID } from "node:crypto";
import type { RegistrationConfig } from "../config.js";
import { ServiceError, systemNow, type Now } from "../errors.js";
import { ageAtLeast, parseBirthdate } from "../helpers/age.js";
import { normalizeAddress } from "../helpers/address.js";
import { normalizeEmail } from "../helpers/email.js";
import type { ProfileRepo } from "../repo/profile.repo.js";
import type { UserRepo } from "../repo/user.repo.js";
import type { AuthService, IssuedSession } from "./auth.service.js";
import type { OtpService, OtpRequestResult } from "./otp.service.js";

export interface RegistrationProfileInput {
  displayName: string;
  birthdate: string; // YYYY-MM-DD
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    region?: string | null;
    postalCode?: string | null;
    country?: string | null;
    memo?: string | null;
  };
}

export interface RegisterInput {
  emailRaw: string;
  code: string;
  profile: RegistrationProfileInput;
  userAgent?: string | null;
}

export interface RegisterResult {
  userId: string;
  session: IssuedSession;
}

export interface RegistrationServiceDeps {
  userRepo: UserRepo;
  profileRepo: ProfileRepo;
  otpService: OtpService;
  authService: AuthService;
  config: RegistrationConfig;
  now?: Now;
}

export class RegistrationService {
  private readonly now: Now;
  constructor(private readonly d: RegistrationServiceDeps) {
    this.now = d.now ?? systemNow;
  }

  /** Request a registration OTP, rejecting up front if the email is already registered so we don't
   *  burn a code on an address that can't complete registration. (Registration is not enumeration-
   *  sensitive like recovery — an existing account is surfaced directly.) */
  async requestOtp(input: { emailRaw: string; ip?: string | null }): Promise<OtpRequestResult> {
    const { canonical } = normalizeEmail(input.emailRaw);
    if (await this.d.profileRepo.getByEmailCanonical(canonical)) {
      throw new ServiceError(
        "email_taken",
        "An account already exists for this email — sign in with your passkey, or use account recovery if you've lost access",
      );
    }
    return this.d.otpService.request({ emailRaw: input.emailRaw, purpose: "registration", ip: input.ip ?? null });
  }

  async registerWithOtp(input: RegisterInput): Promise<RegisterResult> {
    // Validate the request fully BEFORE consuming the OTP, so a 409/403 never burns a valid code.
    const displayName = input.profile?.displayName?.trim();
    if (!displayName) throw new ServiceError("validation", "A display name is required");

    const birthdate = parseBirthdate(input.profile?.birthdate ?? "");
    if (!birthdate) throw new ServiceError("validation", "A valid birthdate (YYYY-MM-DD) is required");

    const { canonical } = normalizeEmail(input.emailRaw);
    if (await this.d.profileRepo.getByEmailCanonical(canonical)) {
      throw new ServiceError(
        "email_taken",
        "An account already exists for this email — sign in with your passkey, or use account recovery if you've lost access",
      );
    }

    // Age gate (docs/01 §4.3) — enforced in the service, against the injected clock.
    if (!ageAtLeast(birthdate, this.d.config.minAgeYears, this.now())) {
      throw new ServiceError("age_restricted", `You must be at least ${this.d.config.minAgeYears} to register`);
    }

    // Everything checks out — verify email ownership last; this consumes the OTP.
    const { email, emailCanonical } = await this.d.otpService.verify({
      emailRaw: input.emailRaw,
      code: input.code,
      purpose: "registration",
    });

    const addr = normalizeAddress(input.profile.address ?? {});
    const userId = randomUUID();

    await this.d.userRepo.create({ id: userId, handle: displayName });
    try {
      await this.d.profileRepo.insert({
        userId,
        line1: addr.line1,
        line2: addr.line2,
        city: addr.city,
        region: addr.region,
        postalCode: addr.postalCode,
        country: addr.country,
        memo: addr.memo,
        birthdate: input.profile.birthdate.trim(),
        email,
        emailCanonical,
      });
    } catch (e) {
      // Roll back the half-built account so a failed profile insert can't orphan a user row.
      await this.d.userRepo.delete(userId).catch(() => {});
      throw e;
    }

    const session = await this.d.authService.issue(userId, "full", input.userAgent ?? null);
    return { userId, session };
  }
}
