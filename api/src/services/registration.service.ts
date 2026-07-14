// RegistrationService: the LEAST-RESISTANCE bootstrap path (C3, WEB-APP-GAPS Part 6 #8). Verify the
// email OTP, then create the account (public.users) + private profile (auth.profiles) and issue a
// LIMITED 'registration'-scoped session ([code-registration-scope]) — full access comes from the
// subsequent passkey enrollment + passkey login.
//
// Required at registration: email (OTP-verified), a unique @handle, and the self-attested over-18
// checkbox. The profile is captured at OTP *request* (server-side draft on auth.email_otp) so verify
// can complete from another browser with only email + code. Optional PII behind a helper: display
// name, legal name, and address. No date of birth ([code-over-18]). Every account is auto-subscribed
// to oursay-global.

import { randomUUID } from "node:crypto";
import type { RegistrationConfig } from "../config.js";
import { ServiceError, type Now } from "../errors.js";
import { normalizeAddress } from "../helpers/address.js";
import { normalizeEmail } from "../helpers/email.js";
import { isValidHandle, normalizeHandle } from "../helpers/handle.js";
import type { MembershipRepo } from "../repo/membership.repo.js";
import type { RegistrationOtpDraft } from "../repo/otp.repo.js";
import type { ProfileRepo } from "../repo/profile.repo.js";
import type { UserRepo } from "../repo/user.repo.js";
import type { AuthService, IssuedSession } from "./auth.service.js";
import type { GeocodeService } from "./geocode.service.js";
import type { OtpService, OtpRequestResult } from "./otp.service.js";

/** The jurisdiction every account is subscribed to at creation ([mvp-c10b-membership]). */
const HOME_JURISDICTION = "oursay-global";

export interface RegistrationProfileInput {
  /** REQUIRED unique @username (public profile). */
  handle: string;
  /** Optional public display text; falls back to the handle without its '@'. */
  displayName?: string | null;
  /** REQUIRED self-attested age gate (must be true). KYC re-verifies; no DOB is stored. */
  over18: boolean;
  /** Optional private PII (KYC); never publicly surfaced. Collected here only behind the
   *  "fill it now" helper — otherwise at KYC start. */
  firstName?: string | null;
  lastName?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    country?: string | null;
    memo?: string | null;
  };
}

export interface RegisterInput {
  emailRaw: string;
  code: string;
  /** Optional when a registration draft was stored on the OTP at request time. */
  profile?: RegistrationProfileInput | null;
  userAgent?: string | null;
}

export interface RegisterResult {
  userId: string;
  session: IssuedSession;
}

export interface RegistrationServiceDeps {
  userRepo: UserRepo;
  profileRepo: ProfileRepo;
  membershipRepo: MembershipRepo;
  otpService: OtpService;
  authService: AuthService;
  /** Best-effort geocoding of the new profile's address into a private point. Never blocks registration. */
  geocodeService: GeocodeService;
  config: RegistrationConfig;
  now?: Now;
}

export class RegistrationService {
  constructor(private readonly d: RegistrationServiceDeps) {}

  /**
   * Request a registration OTP with a profile draft. The handle is reserved for the OTP TTL so
   * another registrant cannot take it mid-flow. Rejects up front if the email is already registered.
   * Resend without a profile reuses the active draft for this email when present.
   */
  async requestOtp(input: {
    emailRaw: string;
    ip?: string | null;
    profile?: RegistrationProfileInput | null;
  }): Promise<OtpRequestResult> {
    const { canonical } = normalizeEmail(input.emailRaw);
    if (await this.d.profileRepo.getByEmailCanonical(canonical)) {
      throw new ServiceError(
        "email_taken",
        "An account already exists for this email — sign in with your passkey, or use account recovery if you've lost access",
      );
    }

    await this.d.otpService.releaseExpiredRegistrationHolds();

    let profileInput = input.profile ?? null;
    if (!profileInput) {
      const active = await this.d.otpService.peekActive(canonical, "registration");
      if (active?.profileJson) {
        profileInput = active.profileJson;
      }
    }
    if (!profileInput) {
      throw new ServiceError("validation", "A registration profile is required to request a code");
    }

    const draft = this.toDraft(profileInput, { requireOver18: true });
    await this.assertHandleAvailable(draft.handle, canonical);

    return this.d.otpService.request({
      emailRaw: input.emailRaw,
      purpose: "registration",
      ip: input.ip ?? null,
      registrationDraft: draft,
    });
  }

  async registerWithOtp(input: RegisterInput): Promise<RegisterResult> {
    // Resolve profile from the body or the active OTP draft BEFORE consuming the code, so a
    // 409/403 never burns a valid OTP.
    const { canonical } = normalizeEmail(input.emailRaw);
    const active = await this.d.otpService.peekActive(canonical, "registration");
    const profileInput = input.profile ?? active?.profileJson ?? null;
    if (!profileInput) {
      throw new ServiceError(
        "validation",
        "A registration profile is required (submit one with the code, or request a code with a profile first)",
      );
    }

    const handle = normalizeHandle(profileInput.handle);
    if (!handle) throw new ServiceError("validation", "A handle (@username) is required");
    if (!isValidHandle(handle)) {
      throw new ServiceError("validation", "Handle must use letters, digits, hyphens, and underscores only");
    }
    if (profileInput.over18 !== true) {
      throw new ServiceError(
        "age_restricted",
        `You must confirm you are at least ${this.d.config.minAgeYears} to register`,
      );
    }

    if (await this.d.userRepo.handleExists(handle)) {
      throw new ServiceError("handle_taken", "That handle is already taken");
    }
    await this.d.otpService.releaseExpiredRegistrationHolds();
    const holder = await this.d.otpService.activeRegistrationHolder(handle);
    if (holder && holder !== canonical) {
      throw new ServiceError("handle_taken", "That handle is already taken");
    }

    if (await this.d.profileRepo.getByEmailCanonical(canonical)) {
      throw new ServiceError(
        "email_taken",
        "An account already exists for this email — sign in with your passkey, or use account recovery if you've lost access",
      );
    }

    // Everything checks out — verify email ownership last; this consumes the OTP.
    const { email, emailCanonical } = await this.d.otpService.verify({
      emailRaw: input.emailRaw,
      code: input.code,
      purpose: "registration",
    });

    const displayName = profileInput.displayName?.trim() || null;
    const addr = normalizeAddress(profileInput.address ?? {});
    const firstName = profileInput.firstName?.trim() || null;
    const lastName = profileInput.lastName?.trim() || null;
    const userId = randomUUID();

    await this.d.userRepo.create({ id: userId, handle, displayName });
    try {
      await this.d.profileRepo.insert({
        userId,
        firstName,
        lastName,
        line1: addr.line1,
        line2: addr.line2,
        city: addr.city,
        province: addr.province,
        postalCode: addr.postalCode,
        country: addr.country,
        memo: addr.memo,
        over18: true,
        email,
        emailCanonical,
      });
      // Every account belongs to the universal record ([mvp-c10b-membership]).
      await this.d.membershipRepo.add(userId, HOME_JURISDICTION);
    } catch (e) {
      // Roll back the half-built account so a failed profile insert can't orphan a user row.
      await this.d.userRepo.delete(userId).catch(() => {});
      throw e;
    }

    // Best-effort geocode when an address was volunteered (structural resolvability, not KYC). Most
    // registrations carry no address — the geocode sync then runs at the first address write (A7).
    await this.d.geocodeService.geocodeForUser(userId, addr);

    // LIMITED enroll-only session: the client enrolls a passkey under it, then passkey-logs-in for
    // a full session ([code-registration-scope]).
    const session = await this.d.authService.issue(userId, "registration", input.userAgent ?? null);
    return { userId, session };
  }

  private async assertHandleAvailable(handle: string, emailCanonical: string): Promise<void> {
    if (await this.d.userRepo.handleExists(handle)) {
      throw new ServiceError("handle_taken", "That handle is already taken");
    }
    const holder = await this.d.otpService.activeRegistrationHolder(handle);
    if (holder && holder !== emailCanonical) {
      throw new ServiceError("handle_taken", "That handle is already taken");
    }
  }

  private toDraft(
    profile: RegistrationProfileInput,
    opts: { requireOver18: boolean },
  ): RegistrationOtpDraft {
    const handle = normalizeHandle(profile.handle);
    if (!handle) throw new ServiceError("validation", "A handle (@username) is required");
    if (!isValidHandle(handle)) {
      throw new ServiceError("validation", "Handle must use letters, digits, hyphens, and underscores only");
    }
    if (opts.requireOver18 && profile.over18 !== true) {
      throw new ServiceError(
        "age_restricted",
        `You must confirm you are at least ${this.d.config.minAgeYears} to register`,
      );
    }
    const draft: RegistrationOtpDraft = {
      handle,
      over18: profile.over18 === true,
    };
    const displayName = profile.displayName?.trim();
    if (displayName) draft.displayName = displayName;
    const firstName = profile.firstName?.trim();
    if (firstName) draft.firstName = firstName;
    const lastName = profile.lastName?.trim();
    if (lastName) draft.lastName = lastName;
    if (profile.address) draft.address = profile.address;
    return draft;
  }
}
