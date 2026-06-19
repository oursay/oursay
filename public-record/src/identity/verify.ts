// Server-side verified-tier gate: is a thread key registered, and is its private binding's platform
// signature valid? Reconstructs the public binding from the stored row IDENTICALLY to how it was
// signed (canonical JSON sorts keys; region is present only when non-null, matching
// buildThreadBindingInputs), then re-verifies binding_sig (defense-in-depth, per locked decision).

import type { PrivateStore, ThreadBindingRow } from "../private/store.js";
import type { ThreadBindingPublic } from "./binding.js";
import { verifyBinding } from "./platform-binding.js";

/** Rebuild the signed public binding from a stored row (must match the registration-time object). */
export function bindingFromRow(row: ThreadBindingRow): ThreadBindingPublic {
  return {
    thread_pubkey: row.threadPubkey,
    thread_id: row.threadId,
    level: row.level,
    kyc_tier: row.kycTier,
    ...(row.region !== null ? { region: row.region } : {}),
    commitment: row.commitment,
  };
}

/**
 * True iff `threadPubkey` is registered (a binding row exists) AND its stored `binding_sig` verifies
 * against the platform public key. A false here means the key is unverified-tier → the action must
 * stay off the verified ledger.
 */
export async function verifyThreadBinding(
  store: PrivateStore,
  threadPubkey: string,
  platformPubKeyHex: string,
): Promise<boolean> {
  const row = await store.getThreadBinding(threadPubkey);
  if (!row) return false;
  return verifyBinding(bindingFromRow(row), row.bindingSig, platformPubKeyHex);
}
