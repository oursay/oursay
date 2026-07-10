/**
 * Auth-modal state as a single discriminated union — replaces the seven parallel
 * `*Open` / `*OtpWindow` booleans that previously let two dialogs open at once.
 * Exactly one dialog is representable at a time, so modal exclusivity holds by
 * construction. The constructors below are the single source of truth for each
 * transition target; AppProvider assigns their results to `state.authModal`.
 */
export type OtpFlow = "registration" | "login" | "recovery";

export type AuthModal =
  /** No auth dialog open. */
  | { kind: "none" }
  /** The register/login/recover chooser. */
  | { kind: "chooser" }
  /** Registration form. */
  | { kind: "register" }
  /** Recovery email-request form (step 1). */
  | { kind: "recover"; email?: string }
  /** Login chooser; `otp` shows the email-OTP sub-path instead of passkey. */
  | { kind: "login"; otp: boolean; email?: string }
  /** OTP-entry dialog, tagged by which flow opened it. */
  | { kind: "otp"; flow: OtpFlow; email?: string };

export const authNone: AuthModal = { kind: "none" };
export const authChooser: AuthModal = { kind: "chooser" };
export const authRegister: AuthModal = { kind: "register" };

/** Login chooser on the passkey path (email prefill optional). */
export const authLogin = (email?: string): AuthModal => ({ kind: "login", otp: false, email });
/** Login chooser already switched to the email-OTP path. */
export const authLoginOtp = (email?: string): AuthModal => ({ kind: "login", otp: true, email });
export const authRecover = (email?: string): AuthModal => ({ kind: "recover", email });
export const authOtp = (flow: OtpFlow, email?: string): AuthModal => ({ kind: "otp", flow, email });

/**
 * Email typed into the login chooser: a valid address jumps straight to the
 * login-OTP entry dialog; an invalid one keeps the chooser on its OTP sub-path
 * so the user can correct it.
 */
export const authLoginByEmail = (email: string, validEmail: boolean): AuthModal =>
  validEmail ? authOtp("login", email) : authLoginOtp(email);

/** Flip the login chooser's email-OTP sub-path; a no-op outside the login modal. */
export const toggleLoginOtp = (m: AuthModal): AuthModal =>
  m.kind === "login" ? { ...m, otp: !m.otp } : m;

/** The email carried by whichever dialog is open (recover/login/otp), if any. */
export const authEmailOf = (m: AuthModal): string | undefined =>
  m.kind === "recover" || m.kind === "login" || m.kind === "otp" ? m.email : undefined;
