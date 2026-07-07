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

export interface RecordStateEntry {
  _my: "up" | "down" | null;
  _myEntityId?: string | null;
  _vote: string | null;
  signed: boolean;
  shared: boolean;
}

export interface ProfileAddressPatch {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string;
  memo?: string | null;
}

const KYC_CYCLE: Array<{ tier: VerificationTier; token: string }> = [
  { tier: 0, token: "unverified" },
  { tier: 1, token: "identity_verified" },
  { tier: 2, token: "residency_verified" },
  { tier: 3, token: "residency_verified" },
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

  const handle = wireHandle(profile.handle)!;

  const publicSelf = await apiGet<{
    tier: string;
    official: boolean;
  }>(`/v1/public/profiles/${encodeURIComponent(handle)}`).catch(() => null);

  const kycTier = publicSelf
    ? tokenToTier(publicSelf.tier, publicSelf.official)
    : 0;

  return {
    userId: session.userId,
    handle,
    displayName: profile.displayName?.trim() || handle,
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

/** Update private profile fields (`PATCH /v1/profile`). */
export async function patchProfile(body: ProfileAddressPatch): Promise<void> {
  await apiPatch("/v1/profile", body);
}

/**
 * Award residency verification after address is set.
 * Uses `POST /v1/kyc/residency/attest` when available; dev-attest fallback until Didit (#6).
 */
export async function attestResidency(): Promise<void> {
  try {
    await apiPost("/v1/kyc/residency/attest", { consent: true });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 501)) {
      await apiPost("/v1/dev/kyc/attest", { tier: "residency_verified" });
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
        ...(st._myEntityId ? { entityId: st._myEntityId } : {}),
      };
    }
    if (st._vote) votes[id] = st._vote;
    if (st.shared) shared[id] = true;
    if (st.signed) petitionSig[id] = petitionSig[id] ?? 1;
  }

  return { reactions, votes, shared, petitionSig };
}
