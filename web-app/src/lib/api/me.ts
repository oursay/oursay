/**
 * Authenticated `/v1/me/*` + profile hydration for AppProvider.
 */

import type { AuthorVisibility, JurisdictionMembership, SigningPrefs, VerificationTier } from "@/lib/types";
import { ALBERTA_ID, DEFAULT_SIGNING, GLOBAL_ID } from "@/lib/types";
import type { SignAction, SignMethod } from "@/lib/types";
import { apiGet, apiPost, apiPut } from "./client";
import { tokenToTier } from "./map";

export interface AccountContext {
  userId: string;
  handle: string;
  displayName: string;
  kycTier: VerificationTier;
  isOfficial: boolean;
  accountVisibility: AuthorVisibility;
  viewerDistricts: string[];
  signing: SigningPrefs;
  subscriptions: JurisdictionMembership[];
}

const KYC_CYCLE: Array<{ tier: VerificationTier; token: string }> = [
  { tier: 0, token: "unverified" },
  { tier: 1, token: "identity_verified" },
  { tier: 2, token: "residency_verified" },
  { tier: 3, token: "residency_verified" },
];

function mapSigningPrefs(raw: Record<string, string>): SigningPrefs {
  const out = { ...DEFAULT_SIGNING };
  for (const action of Object.keys(DEFAULT_SIGNING) as SignAction[]) {
    const v = raw[action];
    if (v === "quick" || v === "ask" || v === "passkey") {
      out[action] = v as SignMethod;
    }
  }
  return out;
}

function mergeSubscriptions(serverIds: string[]): JurisdictionMembership[] {
  const ids = new Set(serverIds);
  if (!ids.has(GLOBAL_ID)) ids.add(GLOBAL_ID);
  return [...ids].map((id) => ({
    id,
    included: id === GLOBAL_ID || id === ALBERTA_ID,
  }));
}

/** Hydrate viewer state from live session + `/v1/me/*`. Returns null when logged out. */
export async function fetchAccountContext(): Promise<AccountContext | null> {
  let session: { userId: string; scope: string } | null;
  try {
    session = await apiGet<{ userId: string; scope: string }>("/v1/auth/session");
  } catch {
    return null;
  }
  if (!session || session.scope !== "full") return null;

  const [profile, districtsRes, signingRaw, membershipsRes] = await Promise.all([
    apiGet<{
      handle: string | null;
      displayName: string | null;
      visibility: AuthorVisibility;
    }>("/v1/profile"),
    apiGet<{ districts: string[] }>("/v1/me/districts"),
    apiGet<Record<string, string>>("/v1/me/signing-prefs"),
    apiGet<{ jurisdictionIds: string[] }>("/v1/me/jurisdictions"),
  ]);

  if (!profile?.handle) return null;

  const publicSelf = await apiGet<{
    tier: string;
    official: boolean;
  }>(`/v1/public/profiles/${encodeURIComponent(profile.handle)}`).catch(() => null);

  const kycTier = publicSelf
    ? tokenToTier(publicSelf.tier, publicSelf.official)
    : 0;

  return {
    userId: session.userId,
    handle: profile.handle,
    displayName: profile.displayName ?? profile.handle,
    kycTier,
    isOfficial: publicSelf?.official ?? false,
    accountVisibility: profile.visibility,
    viewerDistricts: districtsRes?.districts ?? [],
    signing: signingRaw ? mapSigningPrefs(signingRaw) : { ...DEFAULT_SIGNING },
    subscriptions: mergeSubscriptions(membershipsRes?.jurisdictionIds ?? [GLOBAL_ID]),
  };
}

/** Dev KYC attest (`POST /v1/dev/kyc/attest`) — cycles identity → residency. */
export async function devAttestKyc(currentTier: VerificationTier): Promise<VerificationTier> {
  const next = ((currentTier + 1) % 4) as VerificationTier;
  const entry = KYC_CYCLE[next] ?? KYC_CYCLE[0];
  await apiPost("/v1/dev/kyc/attest", { tier: entry.token });
  return next === 3 ? 3 : entry.tier;
}

/** Sync jurisdiction subscriptions to the server. */
export async function putJurisdictionMemberships(
  subs: JurisdictionMembership[],
): Promise<void> {
  const jurisdictionIds = subs.map((s) => s.id);
  await apiPut("/v1/me/jurisdictions", { jurisdictionIds });
}
