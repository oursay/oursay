// Shared account factory — the ONE place specs create accounts directly at the repo layer.
// When the profile schema moves (e.g. [code-over-18] drops birthdate, registration slims to
// handle + over_18), only this helper changes; specs stay untouched.

import { randomUUID } from "node:crypto";
import type { World } from "./world.js";

export interface MakeAccountOptions {
  email?: string;
  handle?: string;
  displayName?: string | null;
  province?: string | null;
  /** [code-over-18]: profile carries the self-attested adult flag; defaults to true. */
  over18?: boolean;
}

export interface MadeAccount {
  userId: string;
  email: string;
  handle: string;
}

/** Insert a user + private profile row directly (no OTP), mirroring what registration produces. */
export async function makeAccount(w: World, opts: MakeAccountOptions = {}): Promise<MadeAccount> {
  const userId = randomUUID();
  const handle = opts.handle ?? `u${userId.replace(/-/g, "").slice(0, 8)}`;
  const email = opts.email ?? `${userId.slice(0, 8)}@example.com`;
  await w.services.repos.user.create({ id: userId, handle, displayName: opts.displayName ?? null });
  await w.services.repos.profile.insert({
    userId,
    firstName: null,
    lastName: null,
    line1: null,
    line2: null,
    city: null,
    province: opts.province === undefined ? "AB" : opts.province,
    postalCode: null,
    country: "CA",
    memo: null,
    over18: opts.over18 ?? true,
    email,
    emailCanonical: email.toLowerCase(),
  });
  return { userId, email, handle };
}

/** makeAccount + a full-scope session — the common shape civic/write specs need. */
export async function fullSessionAccount(
  w: World,
  email: string,
  opts: Omit<MakeAccountOptions, "email"> = {},
): Promise<{ userId: string; token: string }> {
  const { userId } = await makeAccount(w, { ...opts, email });
  const session = await w.services.authService.issue(userId, "full", "test");
  return { userId, token: session.token };
}

/** makeAccount + a limited-scope session (recovery/login negatives). */
export async function limitedSessionAccount(
  w: World,
  email: string,
  scope: "recovery" | "login",
): Promise<{ userId: string; token: string }> {
  const { userId } = await makeAccount(w, { email });
  const session = await w.services.authService.issue(userId, scope, "test");
  return { userId, token: session.token };
}