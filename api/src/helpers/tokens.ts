// Opaque session-token / enrollment-authorization primitives. The raw token is returned to the
// client exactly once; only its hash (pepper + token) is persisted, so a database leak does not
// expose usable tokens.

import { randomBytes } from "node:crypto";
import { sha256Hex } from "@oursay/public-record";

export interface NewToken {
  /** The opaque token handed to the client (never stored). */
  token: string;
  /** The value stored in auth.sessions.token_hash / auth.enrollment_authorizations.token_hash. */
  hash: string;
}

/** Mint a high-entropy opaque token and its storage hash. */
export function newSessionToken(pepper: string): NewToken {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token, pepper) };
}

/** Hash a presented token for lookup against auth.sessions.token_hash (hex). */
export function hashToken(token: string, pepper: string): string {
  return sha256Hex(`oursay/v1/session-token\n${pepper}\n${token}`);
}

/** Mint a high-entropy enrollment-authorization token and its storage hash. */
export function newEnrollmentAuthorizationToken(pepper: string): NewToken {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashEnrollmentAuthorization(token, pepper) };
}

/** Hash a presented enrollment authorization for lookup against auth.enrollment_authorizations.token_hash. */
export function hashEnrollmentAuthorization(token: string, pepper: string): string {
  return sha256Hex(`oursay/v1/enrollment-authorization\n${pepper}\n${token}`);
}
