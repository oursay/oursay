/**
 * Authenticated `/v1/me/*` + profile hydration for AppProvider.
 */

import type {
  AuthorVisibility,
  JurisdictionMembership,
  SigningPrefs,
  VerificationTier,
} from "@/lib/types";
import { wireHandle } from "@/lib/handle";
import { ALBERTA_ID, DEFAULT_SIGNING, GLOBAL_ID } from "@/lib/types";
import type { SignAction, SignMethod } from "@/lib/types";
import { ApiError, apiGet, apiPatch, apiPost, apiPut, buildQuery } from "./client";
import { MY_DISTRICTS } from "@/lib/mock";
import { readSubscriptions } from "@/lib/state/cookies";
import { tokenToTier } from "./map";

export interface AccountContext {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  iconType: string;
  kycTier: VerificationTier;
  isOfficial: boolean;
  /** Platform roles from session (`admin` today). */
  platformRoles: string[];
  accountVisibility: AuthorVisibility;
  viewerDistricts: string[];
  signing: SigningPrefs;
  subscriptions: JurisdictionMembership[];
}

export interface RecordStateEntry {
  _my: "up" | "down" | null;
  _myEntityId?: string | null;
  _vote: string | null;
  signed: boolean;
  shared: boolean;
}

export interface ProfileIdentityPatch {
  handle?: string;
  displayName?: string;
  bio?: string;
  iconType?: string;
}

const KYC_CYCLE: Array<{ tier: VerificationTier; token: string }> = [
  { tier: 0, token: "unverified" },
  { tier: 1, token: "identity_verified" },
  { tier: 2, token: "residency_verified" },
];

export function mapSigningPrefs(raw: Record<string, string>): SigningPrefs {
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
  // Prefer cookie include flags; otherwise Alberta selected, Global subscribed but not in feed.
  const cookieFlags = new Map(readSubscriptions().map((s) => [s.id, s.included]));
  return [...ids].map((id) => ({
    id,
    included: cookieFlags.has(id) ? cookieFlags.get(id)! : id === ALBERTA_ID,
  }));
}

/** Hydrate viewer state from live session + `/v1/me/*`. Returns null when logged out. */
export async function fetchAccountContext(): Promise<AccountContext | null> {
  let session: { userId: string; scope: string; platformRoles?: string[] } | null;
  try {
    session = await apiGet<{ userId: string; scope: string; platformRoles?: string[] }>(
      "/v1/auth/session",
    );
  } catch {
    return null;
  }
  if (!session || session.scope !== "full") return null;

  const [profile, districtsRes, signingRaw, membershipsRes] = await Promise.all([
    apiGet<{
      handle: string | null;
      displayName: string | null;
      bio?: string;
      iconType?: string;
      visibility: AuthorVisibility;
    }>("/v1/profile"),
    apiGet<{ districts: string[] }>("/v1/me/districts"),
    apiGet<Record<string, string>>("/v1/me/signing-prefs"),
    apiGet<{ jurisdictionIds: string[] }>("/v1/me/jurisdictions"),
  ]);

  if (!profile?.handle) return null;

  const handle = wireHandle(profile.handle)!;

  const publicSelf = await apiGet<{
    tier: string;
    official: boolean;
    platformRoles?: string[];
  }>(`/v1/public/profiles/${encodeURIComponent(handle)}`).catch(() => null);

  const kycTier = publicSelf ? tokenToTier(publicSelf.tier) : 0;

  const platformRoles =
    session.platformRoles ?? publicSelf?.platformRoles ?? [];

  return {
    userId: session.userId,
    handle,
    displayName: profile.displayName?.trim() || handle,
    bio: typeof profile.bio === "string" ? profile.bio : "",
    iconType: typeof profile.iconType === "string" ? profile.iconType : "bottts-neutral",
    kycTier,
    isOfficial: publicSelf?.official ?? false,
    platformRoles: Array.isArray(platformRoles) ? platformRoles : [],
    accountVisibility: profile.visibility,
    viewerDistricts: districtsRes?.districts ?? [],
    signing: signingRaw ? mapSigningPrefs(signingRaw) : { ...DEFAULT_SIGNING },
    subscriptions: mergeSubscriptions(membershipsRes?.jurisdictionIds ?? [GLOBAL_ID]),
  };
}

/** Dev official role assign/revoke (`POST /v1/dev/official/role`). */
export async function devSetOfficialRole(assign: boolean): Promise<void> {
  await apiPost("/v1/dev/official/role", {
    assign,
    jurisdictionId: ALBERTA_ID,
    districtSlug: MY_DISTRICTS[0],
  });
}

/**
 * Dev Validate ID cycle (`POST /v1/dev/kyc/attest` + official role):
 *   unverified → identity → residency → residency+official → unverified.
 */
export async function devAttestKyc(
  currentTier: VerificationTier,
  isOfficial = false,
): Promise<{ kycTier: VerificationTier; isOfficial: boolean }> {
  if (!isOfficial && currentTier === 2) {
    await devSetOfficialRole(true);
    return { kycTier: 2, isOfficial: true };
  }

  if (isOfficial) {
    await devSetOfficialRole(false);
    await apiPost("/v1/dev/kyc/attest", { tier: "unverified" });
    return { kycTier: 0, isOfficial: false };
  }

  const next = ((currentTier + 1) % 3) as VerificationTier;
  const entry = KYC_CYCLE[next] ?? KYC_CYCLE[0];
  await apiPost("/v1/dev/kyc/attest", { tier: entry.token });
  return { kycTier: entry.tier, isOfficial: false };
}

/** Sync jurisdiction subscriptions to the server. */
export async function putJurisdictionMemberships(
  subs: JurisdictionMembership[],
): Promise<void> {
  const jurisdictionIds = subs.map((s) => s.id);
  await apiPut("/v1/me/jurisdictions", { jurisdictionIds });
}

/** Batch read viewer participation markers (`GET /v1/me/record-state`). */
export async function getRecordStates(
  ids: string[],
): Promise<Record<string, RecordStateEntry>> {
  if (ids.length === 0) return {};
  const qs = buildQuery({ ids });
  const res = await apiGet<{ states: Record<string, RecordStateEntry> }>(
    `/v1/me/record-state${qs}`,
  );
  return res?.states ?? {};
}

/** Record a share mark (`POST /v1/me/shares/{shareKey}`). */
export async function postShareMark(
  shareKey: string,
): Promise<{ counted: boolean; count: number }> {
  const res = await apiPost<{ counted: boolean; count: number }>(
    `/v1/me/shares/${encodeURIComponent(shareKey)}`,
  );
  if (!res) throw new Error("share mark returned empty body");
  return res;
}

/** Set or clear a per-thread visibility override (`PUT /v1/me/threads/{id}/visibility`). */
export async function putThreadVisibility(
  threadId: string,
  visibility: AuthorVisibility | null,
): Promise<void> {
  await apiPut(`/v1/me/threads/${encodeURIComponent(threadId)}/visibility`, {
    visibility,
  });
}

/** Update account-default author visibility (`PATCH /v1/me/visibility`). */
export async function patchAccountVisibility(
  visibility: AuthorVisibility,
): Promise<void> {
  await apiPatch("/v1/me/visibility", { visibility });
}

/** Merge signing preferences (`PATCH /v1/me/signing-prefs`). */
export async function patchSigningPrefs(
  patch: Partial<Record<SignAction, SignMethod>>,
): Promise<SigningPrefs> {
  const raw = await apiPatch<Record<string, string>>("/v1/me/signing-prefs", patch);
  return mapSigningPrefs(raw);
}

/** Update OurSay-owned public identity (`PATCH /v1/profile`). */
export async function patchProfile(body: ProfileIdentityPatch): Promise<void> {
  await apiPatch("/v1/profile", body);
}

/**
 * Stub/dev Didit-mimic identity: awards `identity_verified` only (no tier cycle).
 */
export async function stubApproveIdentity(): Promise<void> {
  await apiPost("/v1/dev/kyc/attest", { tier: "identity_verified" });
}

/**
 * Stub/dev Didit-mimic POA (`POST /v1/dev/kyc/poa`): awards residency + private seed point.
 * Does not require a prior profile address (unlike platform `/v1/kyc/residency/attest`).
 */
export async function stubApprovePoa(): Promise<void> {
  await apiPost("/v1/dev/kyc/poa", {});
}

/**
 * Platform self-attest residency when a geocoded point already sits inside the jurisdiction.
 * Uses `POST /v1/kyc/residency/attest`; falls back to stub Didit-mimic POA when the route is missing.
 */
export async function attestResidency(): Promise<void> {
  try {
    await apiPost("/v1/kyc/residency/attest", { consent: true });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 501)) {
      await stubApprovePoa();
      return;
    }
    throw e;
  }
}

/** Map record-state entries into AppProvider civic write maps. */
export function applyRecordStates(
  states: Record<string, RecordStateEntry>,
  prev: {
    reactions: Record<string, { dir: "up" | "down"; entityId?: string } | null>;
    votes: Record<string, string>;
    shared: Record<string, true>;
    petitionSig: Record<string, number>;
  },
): {
  reactions: Record<string, { dir: "up" | "down"; entityId?: string } | null>;
  votes: Record<string, string>;
  shared: Record<string, true>;
  petitionSig: Record<string, number>;
} {
  const reactions = { ...prev.reactions };
  const votes = { ...prev.votes };
  const shared = { ...prev.shared };
  const petitionSig = { ...prev.petitionSig };

  for (const [id, st] of Object.entries(states)) {
    if (st._my) {
      reactions[id] = {
        dir: st._my,
        entityId: st._myEntityId ?? prev.reactions[id]?.entityId,
      };
    }
    if (st._vote) votes[id] = st._vote;
    if (st.shared) shared[id] = true;
    if (st.signed) petitionSig[id] = petitionSig[id] ?? 1;
  }

  return { reactions, votes, shared, petitionSig };
}
