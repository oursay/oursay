// RecoveryService: regain access on a new device / lost passkey via email OTP.
//
// Branch on verified status resolved from public.kyc_attestations (no row = unverified):
//   - unverified  → issue a limited 'recovery'-scoped session; the client re-enrolls a passkey.
//   - verified    → policy STUB: email alone is insufficient; future KYC re-verification is required
//                   (provider stubbed this milestone). We surface kyc_reverification_required.
//
// To avoid account enumeration, requestRecovery always reports success but only actually emails a
// code when an account exists for the address.

import { ServiceError, systemNow, type Now } from "../errors.js";
import { normalizeEmail } from "../helpers/email.js";
import type { KycRepo } from "../repo/kyc.repo.js";
import type { ProfileRepo } from "../repo/profile.repo.js";
import type { AuthService, IssuedSession } from "./auth.service.js";
import type { OtpService, OtpRequestResult } from "./otp.service.js";

export interface RecoveryServiceDeps {
  otpService: OtpService;
  profileRepo: ProfileRepo;
  kycRepo: KycRepo;
  authService: AuthService;
  now?: Now;
}

// verifyRecovery throws kyc_reverification_required for verified accounts, so a returned value is
// always the passkey re-enroll branch.
export interface RecoveryVerifyResult {
  status: "passkey_reenroll";
  userId: string;
  session: IssuedSession;
}

export class RecoveryService {
  private readonly now: Now;
  constructor(private readonly d: RecoveryServiceDeps) {
    this.now = d.now ?? systemNow;
  }

  /** Emails a code only when the account exists; otherwise a silent no-op (no enumeration). */
  async requestRecovery(input: { emailRaw: string; ip?: string | null }): Promise<OtpRequestResult | null> {
    const { canonical } = normalizeEmail(input.emailRaw);
    const profile = await this.d.profileRepo.getByEmailCanonical(canonical);
    if (!profile) return null;
    return this.d.otpService.request({ emailRaw: input.emailRaw, purpose: "recovery", ip: input.ip ?? null });
  }

  async verifyRecovery(input: {
    emailRaw: string;
    code: string;
    userAgent?: string | null;
  }): Promise<RecoveryVerifyResult> {
    const { emailCanonical } = await this.d.otpService.verify({
      emailRaw: input.emailRaw,
      code: input.code,
      purpose: "recovery",
    });

    const profile = await this.d.profileRepo.getByEmailCanonical(emailCanonical);
    if (!profile) {
      // OTP verified but no account — treat as invalid rather than leak state.
      throw new ServiceError("otp_invalid", "Invalid or expired code");
    }

    if (await this.d.kycRepo.isVerified(profile.userId)) {
      // Verified users cannot recover via email alone (policy stub for future KYC re-verification).
      throw new ServiceError(
        "kyc_reverification_required",
        "This account is identity-verified; recovery requires KYC re-verification (not available yet)",
      );
    }

    const session = await this.d.authService.issue(profile.userId, "recovery", input.userAgent ?? null);
    return { status: "passkey_reenroll", userId: profile.userId, session };
  }
}
