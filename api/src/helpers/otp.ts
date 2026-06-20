// Pure OTP primitives: generate a numeric code, hash it for storage (pepper + per-row salt), and
// compare in constant time. The plaintext code is never stored — only generateOtp's caller holds it
// briefly to email it; everything persisted goes through hashOtp.

import { randomInt, timingSafeEqual } from "node:crypto";
import { newSalt, sha256Hex } from "@oursay/public-record";

/** A cryptographically-random numeric code of `length` digits (leading zeros preserved). */
export function generateOtp(length: number): string {
  let code = "";
  for (let i = 0; i < length; i++) code += randomInt(0, 10).toString();
  return code;
}

export interface HashOtpInput {
  pepper: string;
  emailCanonical: string;
  code: string;
  salt: string;
}

/** Domain-separated, salted, peppered hash of an OTP code (hex). */
export function hashOtp({ pepper, emailCanonical, code, salt }: HashOtpInput): string {
  return sha256Hex(`oursay/v1/otp\n${pepper}\n${emailCanonical}\n${salt}\n${code}`);
}

/** Fresh per-row salt (hex) for an OTP hash. */
export function newOtpSalt(): string {
  return newSalt();
}

/** Constant-time equality for two hex digests of equal length. */
export function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** An expiry timestamp `ttlSec` seconds after `now`. */
export function expiryFrom(now: Date, ttlSec: number): Date {
  return new Date(now.getTime() + ttlSec * 1000);
}
