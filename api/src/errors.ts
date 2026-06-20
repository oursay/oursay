// Domain error type shared by services. Services throw ServiceError with a stable `code`; the HTTP
// layer (http/errors.ts) maps codes to status + OpenAPI error bodies. Keeping this out of the HTTP
// layer means the same errors surface identically from the CLI and direct imports.

export type ErrorCode =
  | "validation"
  | "rate_limited"
  | "otp_invalid"
  | "otp_expired"
  | "otp_max_attempts"
  | "age_restricted"
  | "email_taken"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "challenge_invalid"
  | "passkey_verification_failed"
  | "kyc_reverification_required"
  | "conflict";

export class ServiceError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function isServiceError(e: unknown): e is ServiceError {
  return e instanceof ServiceError;
}

/** Default clock; services accept an injectable `Now` so time-based logic stays testable. */
export type Now = () => Date;
export const systemNow: Now = () => new Date();
