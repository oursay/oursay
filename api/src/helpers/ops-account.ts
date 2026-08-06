// Provision the platform ops service account + enroll its soft P-256 key for CLI attestations.
// Real auth user with `admin` role — not a civic persona for the public feed.

import { randomUUID } from "node:crypto";
import { platformPublicKey } from "@oursay/public-record";
import { platformOpsConfig } from "../config.js";
import type { Services } from "../container.js";

export interface EnsuredOpsAccount {
  userId: string;
  handle: string;
  pubkeyHex: string;
  privKeyHex: string;
}

/**
 * Ensure the ops service account exists, has admin, and has the configured soft-key enrolled.
 * Idempotent — safe for seed + CLI startup.
 */
export async function ensureOpsServiceAccount(
  services: Services,
  opts: { privKeyHex?: string; handle?: string; email?: string } = {},
): Promise<EnsuredOpsAccount> {
  const privKeyHex = opts.privKeyHex ?? platformOpsConfig.adminPrivKeyHex;
  if (!privKeyHex) {
    throw new Error("PLATFORM_OPS_ADMIN_PRIVKEY is required to provision the ops soft-key");
  }
  const pubkeyHex = platformPublicKey(privKeyHex).toLowerCase();
  const handle = opts.handle ?? platformOpsConfig.opsHandle;
  const email = opts.email ?? platformOpsConfig.opsEmail;

  let user = await services.repos.user.getByHandle(handle);
  if (!user) {
    const userId = randomUUID();
    await services.repos.user.create({ id: userId, handle, displayName: "OurSay Ops" });
    await services.repos.profile.insert({
      userId,
      firstName: null,
      lastName: null,
      line1: null,
      line2: null,
      city: null,
      province: null,
      postalCode: null,
      country: "CA",
      memo: null,
      over18: true,
      email,
      emailCanonical: email.toLowerCase(),
    });
    await services.repos.profile.setVisibility(userId, "anonymous");
    user = await services.repos.user.getById(userId);
    if (!user) throw new Error("failed to create ops service account");
  }

  await services.repos.platformRole.grant(user.id, "admin", null);

  const existing = await services.repos.opsSigningKey.getByPubkeyHex(pubkeyHex);
  if (!existing) {
    await services.repos.opsSigningKey.insert({
      id: randomUUID(),
      userId: user.id,
      pubkeyHex,
      label: "ops-cli-soft",
    });
  } else if (existing.userId !== user.id) {
    throw new Error(`ops soft-key pubkey already enrolled to a different user (${existing.userId})`);
  }

  return { userId: user.id, handle: user.handle, pubkeyHex, privKeyHex };
}
