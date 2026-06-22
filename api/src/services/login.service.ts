// LoginService: the gated cross-device sign-in path (docs/08). Email OTP is NOT a standing login
// method — once an account has a passkey, a bare email code must not log it in. Login OTP only works
// inside an explicitly authorized window:
//
//   1. enable()          — called from a TRUSTED device (full session + ≥1 enrolled passkey). It
//                          opens the login window by issuing a 'login' OTP to the account email. The
//                          active 'login' OTP row IS the window (TTL = OTP_TTL_SEC; one per account).
//   2. requestLoginOtp() — the unified-endpoint (re)send path. It only sends if a window is already
//                          open (an active 'login' OTP exists); otherwise a silent no-op, so a new
//                          device cannot probe for accounts or self-authorize (no enumeration).
//   3. verifyLogin()     — on the NEW device: verify the code → issue a LIMITED 'login'-scoped
//                          session (enroll-only; can register a passkey, nothing more). Full access
//                          comes from the subsequent passkey login. Login does NOT revoke other
//                          sessions (adding a device is additive — unlike recovery, which resets).

import { ServiceError, systemNow, type Now } from "../errors.js";
import { normalizeEmail } from "../helpers/email.js";
import type { PasskeyRepo } from "../repo/passkey.repo.js";
import type { ProfileRepo } from "../repo/profile.repo.js";
import type { AuthService, IssuedSession } from "./auth.service.js";
import type { OtpService, OtpRequestResult } from "./otp.service.js";

export interface LoginServiceDeps {
  otpService: OtpService;
  profileRepo: ProfileRepo;
  passkeyRepo: PasskeyRepo;
  authService: AuthService;
  now?: Now;
}

export interface LoginVerifyResult {
  status: "passkey_enroll";
  userId: string;
  session: IssuedSession;
}

export class LoginService {
  private readonly now: Now;
  constructor(private readonly d: LoginServiceDeps) {
    this.now = d.now ?? systemNow;
  }

  /**
   * Authorize a cross-device sign-in from a trusted device: requires an enrolled passkey (otherwise
   * there is nothing to be "adding a device" to — use registration/recovery). Opens/refreshes the
   * login window by sending a 'login' OTP to the account's own email.
   */
  async enable(input: { userId: string }): Promise<OtpRequestResult> {
    const profile = await this.d.profileRepo.getByUserId(input.userId);
    if (!profile) throw new ServiceError("not_found", "Account not found");

    const passkeys = await this.d.passkeyRepo.listByUserId(input.userId);
    if (passkeys.length === 0) {
      throw new ServiceError(
        "forbidden",
        "Enable cross-device login from a device that already has a passkey enrolled",
      );
    }

    return this.d.otpService.request({ emailRaw: profile.email, purpose: "login" });
  }

  /**
   * Unified-endpoint (re)send for the 'login' purpose. Sends a fresh code ONLY when a window is
   * already open (an active 'login' OTP exists for the address). No open window → silent no-op
   * (returns null); the route still replies 202 so no account state leaks.
   */
  async requestLoginOtp(input: { emailRaw: string; ip?: string | null }): Promise<OtpRequestResult | null> {
    const { canonical } = normalizeEmail(input.emailRaw);
    const open = await this.d.otpService.hasActive(canonical, "login");
    if (!open) return null;
    return this.d.otpService.request({ emailRaw: input.emailRaw, purpose: "login", ip: input.ip ?? null });
  }

  /**
   * Complete login on a new device. Verifies the 'login' OTP (which requires a window to have been
   * opened) and issues a LIMITED 'login'-scoped session for passkey enrollment. Other sessions are
   * left intact.
   */
  async verifyLogin(input: { emailRaw: string; code: string; userAgent?: string | null }): Promise<LoginVerifyResult> {
    const { emailCanonical } = await this.d.otpService.verify({
      emailRaw: input.emailRaw,
      code: input.code,
      purpose: "login",
    });

    const profile = await this.d.profileRepo.getByEmailCanonical(emailCanonical);
    if (!profile) {
      // OTP verified but no account — treat as invalid rather than leak state (mirrors recovery).
      throw new ServiceError("otp_invalid", "Invalid or expired code");
    }

    const session = await this.d.authService.issue(profile.userId, "login", input.userAgent ?? null);
    return { status: "passkey_enroll", userId: profile.userId, session };
  }
}
