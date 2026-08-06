// RecoveryService: regain access on a new device / lost passkey via email OTP.
//
// Branch on verified status resolved from public.kyc_attestations (no row = unverified):
//   - unverified  → issue a limited 'recovery'-scoped session; the client re-enrolls a passkey.
//   - verified    → issue 'recovery_kyc' session; client must complete Didit biometric (workflow 03)
//                   then exchange for a 'recovery' session (passkey re-enroll). Email alone is insufficient
//                   (US-SYS-5).
//
// To avoid account enumeration, requestRecovery always reports success but only actually emails a
// code when an account exists for the address.

import { ServiceError, systemNow, type Now } from "../errors.js";
import { normalizeEmail } from "../helpers/email.js";
import type { KycRepo } from "../repo/kyc.repo.js";
import type { ProfileRepo } from "../repo/profile.repo.js";
import type { AuthService, IssuedSession } from "./auth.service.js";
import type { KycSessionService } from "./kyc-session.service.js";
import type { OtpService, OtpRequestResult } from "./otp.service.js";

export interface RecoveryServiceDeps {
  otpService: OtpService;
  profileRepo: ProfileRepo;
  kycRepo: KycRepo;
  authService: AuthService;
  kycSessionService: KycSessionService;
  now?: Now;
}

export type RecoveryVerifyResult =
  | { status: "passkey_reenroll"; userId: string; session: IssuedSession }
  | { status: "kyc_reverification_required"; userId: string; session: IssuedSession };

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
      // Verified: email proves inbox control only. Issue a biometric challenge session (no passkey enroll).
      const session = await this.d.authService.issue(profile.userId, "recovery_kyc", input.userAgent ?? null);
      return { status: "kyc_reverification_required", userId: profile.userId, session };
    }

    // Recovery means the account holder may have lost a device — revoke every prior session before
    // handing back a fresh recovery-scoped one, so a lost/stolen device can't ride through recovery.
    // Credential wipe happens later at recovery-scoped passkey re-enroll (atomic reset).
    await this.d.authService.revokeAllForUser(profile.userId);

    const session = await this.d.authService.issue(profile.userId, "recovery", input.userAgent ?? null);
    return { status: "passkey_reenroll", userId: profile.userId, session };
  }

  /** Start Didit biometric recovery for a recovery_kyc-scoped caller. */
  async startRecoveryKyc(userId: string): Promise<{ sessionId: string; url: string }> {
    return this.d.kycSessionService.startDiditSession(userId, "recovery");
  }

  /**
   * Poll recovery biometric session. On Approved: revoke all sessions and issue a recovery-scoped
   * session for passkey re-enroll (tier attestations are left unchanged). Credential wipe happens
   * at recovery-scoped passkey re-enroll (atomic reset).
   */
  async pollRecoveryKyc(
    userId: string,
    sessionId: string,
    userAgent?: string | null,
  ): Promise<
    | { status: "pending" | "declined" | "abandoned" | "expired" | "in_review"; tier: null }
    | { status: "approved"; tier: null; passkeyReenroll: { userId: string; session: IssuedSession } }
  > {
    const polled = await this.d.kycSessionService.getDiditSessionStatus(userId, sessionId);
    if (polled.status !== "approved") {
      return { status: polled.status as "pending" | "declined" | "abandoned" | "expired" | "in_review", tier: null };
    }

    const row = await this.d.kycSessionService.getOwnedSession(userId, sessionId);
    if (!row || row.workflowKind !== "recovery") {
      throw new ServiceError("forbidden", "Not a recovery KYC session");
    }
    if (!row.attestedAt) {
      // Race: decision approved but claim not finished — treat as still pending.
      return { status: "pending", tier: null };
    }

    await this.d.authService.revokeAllForUser(userId);
    const session = await this.d.authService.issue(userId, "recovery", userAgent ?? null);
    return {
      status: "approved",
      tier: null,
      passkeyReenroll: { userId, session },
    };
  }
}
