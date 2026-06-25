// Public, unauthenticated READ surface over the civic record. Thin orchestration over
// @oursay/public-record's fold-on-read projections + store queries (getThread, reactionTallies,
// getPollResults, getPetitionSignatureCount, listRootEntities) — no fold/projection logic is
// reimplemented here. Every response is built from response-safe `PublicEntityView` semantics
// (withheld content stays withheld) and carries audience-scope metadata.
//
// The geo `scope` AND the KYC `tier` are RESOLVED on the count endpoints (docs/06 §2–3): compileScope →
// Region and the requested tier SET, then each distinct participant is tested (participantInRegion for
// geo; resolveUserId → latest attestation for tier) and counts re-aggregate over participants passing
// EVERY active dimension (AND), with a k-anonymity floor when either narrows (`applied.geo`/`applied.tier`/
// `kAnonymityFloor` in the echo). Tier matching is SET MEMBERSHIP (current tier ∈ requested set), not
// at-or-above. The date range is still a STUB — parsed/validated and echoed (`applied.date` false), not
// resolved. Lists + thread detail apply no geo/tier filter (parse + echo only). Petition-signature /
// poll-vote counts are surfaced ungated in dev; production withholds them per jurisdiction/KYC policy.

import type { Region, RegionResolver } from "@oursay/geo";
import {
  getJurisdiction,
  getThread,
  reactionTallies,
  rulesOf,
  toPublicView,
  type PrivateStore,
  type PublicEntityView,
  type ReactionCount,
  type RecordType,
  type Thread,
} from "@oursay/public-record";
import { publicCountsKAnon } from "../config.js";
import { ServiceError } from "../errors.js";
import type { KycRepo } from "../repo/kyc.repo.js";
import { KYC_TIERS, normalizeTier, type KycTier } from "../types/kyc.js";
import type { ParticipantGeoService, ParticipantRef } from "./participant-geo.service.js";

/** The four coarse geographic audiences (fixed enum — no freeform district ids, which would invite
 *  the cross-boundary triangulation docs/06 §2–3 warns against). */
export type GeoScope = "jurisdiction" | "impacted-region" | "my-district" | "all-public";
export const GEO_SCOPES: GeoScope[] = ["jurisdiction", "impacted-region", "my-district", "all-public"];

// Canonical KYC tiers live in ../types/kyc.js (shared, dependency-free) so the provider seam + routes
// import the SAME enum without a cycle. Re-exported here for existing import sites (routes, tests).
export { KYC_TIERS, normalizeTier, type KycTier };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_JURISDICTION = "oursay-global";
const DATE_NOTE =
  "date range filter is not yet implemented — from/to are parsed and echoed, not resolved";
const GEO_APPLIED_NOTE =
  "geo scope resolved to a region; counts reflect distinct in-region participants only";
const TIER_APPLIED_NOTE =
  "tier set resolved; counts reflect distinct participants whose current tier is in the requested set";
const MY_DISTRICT_NOTE =
  "scope=my-district is inert on unauthenticated routes (no viewer identity to resolve a district); no geo filter applied";
const COUNT_GATING_NOTE =
  "vote/signature counts are publicly exposed for this jurisdiction (subject to the k-anonymity floor)";
const WITHHELD_NOTE =
  "vote/signature counts are not publicly exposed for this jurisdiction";
function tierGatedNote(minTier: readonly string[]): string {
  return (
    `vote/signature counts are tier-gated for this jurisdiction; restrict the request to verified ` +
    `tier(s) in {${minTier.join(", ")}} (e.g. ?tier=${minTier[0]}) to view them`
  );
}

/** Why a vote/signature scalar is (or isn't) on a public surface, driven by JurisdictionConfig.counts:
 *  `none` — exposed (still subject to the k-anonymity floor); `withheld` — never publicly exposed for
 *  this jurisdiction; `tier-gated` — exposed only when the request restricts to a tier set ⊆ the
 *  jurisdiction's minTier (so list/detail, which never filter by tier, always withhold a gated scalar). */
export type CountGating = "none" | "withheld" | "tier-gated";

/** Read filters as received from the HTTP layer (already enum-validated by JSON schema). */
export interface PublicReadFilters {
  scope?: GeoScope;
  /** Requested KYC tier(s) — a SET (OR). On counts, a participant is counted iff their CURRENT tier is
   *  in this set (not at-or-above). Empty/absent ⇒ no tier filter. */
  tier?: KycTier[];
  jurisdiction?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** Audience metadata for clients + future filters (not write-policy enforcement). */
export interface AudienceScope {
  jurisdiction: string;
  appliesToDistrictIds: string[];
}

/** Per-dimension applied status. `geo` and `tier` are live on counts (a narrowing filter was compiled
 *  and used); `date` stays false (no date filtering yet). Lists/detail never set geo/tier true — they
 *  parse + echo only. */
export interface AppliedDimensions {
  geo: boolean;
  tier: boolean;
  date: false;
}

/** The filter echo. `applied.geo`/`applied.tier` are true only when that dimension compiled to a
 *  narrowing filter and was used. `tier` echoes the requested set (de-duped) or null. `kAnonymityFloor`
 *  is the effective floor applied when EITHER dimension narrows a count payload, or null (lists,
 *  all-public + no tier, inert my-district). */
export interface FilterEcho {
  scope: GeoScope;
  tier: KycTier[] | null;
  jurisdiction: string | null;
  from: string | null;
  to: string | null;
  applied: AppliedDimensions;
  kAnonymityFloor: number | null;
  note: string;
}

/** A reaction tally bucket. `count` is null and `suppressed` true when the in-region count fell below
 *  the k-anonymity floor (0 < count < effectiveK); a genuine 0 stays 0. */
export interface ReactionCountView {
  kind: string;
  count: number | null;
  suppressed?: true;
}
/** A poll option tally bucket (same suppression semantics as {@link ReactionCountView}). */
export interface PollResultView {
  option: string;
  count: number | null;
  suppressed?: true;
}

export interface PageInfo {
  limit: number;
  offset: number;
  total: number;
}

export interface RootSummaryBase {
  entityId: string;
  type: RecordType;
  content: unknown | null;
  withheld: boolean;
  createdAt: string;
  audienceScope: AudienceScope;
}
export interface PostSummary extends RootSummaryBase {
  reactions: ReactionCount[];
}
export interface PetitionSummary extends RootSummaryBase {
  /** Null when the jurisdiction's count policy withholds or tier-gates the scalar (lists never filter
   *  by tier, so a tier-gated scalar is always null here — call /counts?tier=… to view it). */
  signatureCount: number | null;
  countGating: CountGating;
  countGatingNote: string;
}
export interface PollSummary extends RootSummaryBase {
  /** Option counts are null when the jurisdiction's count policy withholds/tier-gates votes (see
   *  {@link PetitionSummary.signatureCount}); option labels are still listed. */
  results: { option: string; count: number | null }[];
  countGating: CountGating;
  countGatingNote: string;
}

export interface ListResponse<T> {
  items: T[];
  page: PageInfo;
  filters: FilterEcho;
}

export interface ThreadDetail {
  root: PublicEntityView;
  audienceScope: AudienceScope;
  reactionsByEntity: ReactionCount[];
  reactionsByCurrentRevision: ReactionCount[];
  comments: Thread["comments"];
}
export interface PetitionDetail extends ThreadDetail {
  /** Null when the jurisdiction's count policy withholds/tier-gates the scalar (detail never filters by
   *  tier, so a tier-gated scalar is always null — call /counts?tier=… to view it). */
  signatureCount: number | null;
  countGating: CountGating;
  countGatingNote: string;
}
export interface PollDetail extends ThreadDetail {
  results: { option: string; count: number | null }[];
  countGating: CountGating;
  countGatingNote: string;
}

export interface PostCounts {
  entityId: string;
  reactionsByEntity: ReactionCountView[];
  reactionsByCurrentRevision: ReactionCountView[];
  filters: FilterEcho;
}
export interface PetitionCounts {
  entityId: string;
  /** Null when suppressed by the k-anonymity floor OR withheld/tier-gated by jurisdiction count policy
   *  (distinguish via `suppressed` + `countGating`). */
  signatureCount: number | null;
  /** True when an EXPOSED, geo/tier-scoped signature count was suppressed by the k-anonymity floor
   *  (orthogonal to count-policy withholding, which sets `countGating` ≠ "none" with `suppressed` false). */
  suppressed: boolean;
  countGating: CountGating;
  countGatingNote: string;
  filters: FilterEcho;
}
export interface PollCounts {
  entityId: string;
  results: PollResultView[];
  countGating: CountGating;
  countGatingNote: string;
  filters: FilterEcho;
}

export interface PublicRecordReadServiceDeps {
  recordStore: PrivateStore;
  regionResolver: RegionResolver;
  participantGeoService: ParticipantGeoService;
  /** Read seam for the CURRENT verification tier of a resolved participant (latest attestation). */
  kycRepo: KycRepo;
}

export class PublicRecordReadService {
  constructor(private readonly d: PublicRecordReadServiceDeps) {}

  // ── Browse lists (newest first; tombstones excluded by the store query) ──────────────────

  async listPosts(filters: PublicReadFilters = {}): Promise<ListResponse<PostSummary>> {
    const { limit, offset } = pageParams(filters);
    const [rows, total] = await Promise.all([
      this.d.recordStore.listRootEntities("post", { limit, offset }),
      this.d.recordStore.countRootEntities("post"),
    ]);
    const items = await Promise.all(
      rows.map(async (row) => {
        const view = toPublicView(row);
        const reactions = await this.d.recordStore.getReactionCountsByEntity(row.entityId);
        return { ...this.summaryBase(view, row.createdAt, await this.audienceScope(row.entityId, view)), reactions };
      }),
    );
    return { items, page: { limit, offset, total }, filters: echoFilters(filters) };
  }

  async listPetitions(filters: PublicReadFilters = {}): Promise<ListResponse<PetitionSummary>> {
    const { limit, offset } = pageParams(filters);
    const [rows, total] = await Promise.all([
      this.d.recordStore.listRootEntities("petition", { limit, offset }),
      this.d.recordStore.countRootEntities("petition"),
    ]);
    const items = await Promise.all(
      rows.map(async (row) => {
        const view = toPublicView(row);
        const audience = await this.audienceScope(row.entityId, view);
        // Lists never filter by tier, so a tier-gated scalar is always withheld here (requestedTiers=null).
        const exposure = this.countExposure(audience.jurisdiction, "signatures", null);
        const signatureCount = exposure.exposed ? await this.d.recordStore.getPetitionSignatureCount(row.entityId) : null;
        return { ...this.summaryBase(view, row.createdAt, audience), signatureCount, countGating: exposure.gating, countGatingNote: exposure.note };
      }),
    );
    return { items, page: { limit, offset, total }, filters: echoFilters(filters) };
  }

  async listPolls(filters: PublicReadFilters = {}): Promise<ListResponse<PollSummary>> {
    const { limit, offset } = pageParams(filters);
    const [rows, total] = await Promise.all([
      this.d.recordStore.listRootEntities("poll", { limit, offset }),
      this.d.recordStore.countRootEntities("poll"),
    ]);
    const items = await Promise.all(
      rows.map(async (row) => {
        const view = toPublicView(row);
        const audience = await this.audienceScope(row.entityId, view);
        const exposure = this.countExposure(audience.jurisdiction, "votes", null);
        const raw = await this.d.recordStore.getPollResults(row.entityId);
        // Option labels stay listed even when withheld; only the counts are nulled.
        const results = exposure.exposed ? raw : raw.map((r) => ({ option: r.option, count: null }));
        return { ...this.summaryBase(view, row.createdAt, audience), results, countGating: exposure.gating, countGatingNote: exposure.note };
      }),
    );
    return { items, page: { limit, offset, total }, filters: echoFilters(filters) };
  }

  // ── Detail (full folded thread + type-specific counts) ───────────────────────────────────

  async getPost(id: string): Promise<ThreadDetail> {
    return this.threadDetail(id, "post");
  }

  async getPetition(id: string): Promise<PetitionDetail> {
    const base = await this.threadDetail(id, "petition");
    const exposure = this.countExposure(base.audienceScope.jurisdiction, "signatures", null);
    return {
      ...base,
      signatureCount: exposure.exposed ? await this.d.recordStore.getPetitionSignatureCount(id) : null,
      countGating: exposure.gating,
      countGatingNote: exposure.note,
    };
  }

  async getPoll(id: string): Promise<PollDetail> {
    const base = await this.threadDetail(id, "poll");
    const exposure = this.countExposure(base.audienceScope.jurisdiction, "votes", null);
    const raw = await this.d.recordStore.getPollResults(id);
    return {
      ...base,
      results: exposure.exposed ? raw : raw.map((r) => ({ option: r.option, count: null })),
      countGating: exposure.gating,
      countGatingNote: exposure.note,
    };
  }

  // ── Dedicated count endpoints (jurisdiction exposure gate + geo scope + KYC tier + k-anonymity; date stubbed) ──

  async getPostCounts(id: string, filters: PublicReadFilters = {}): Promise<PostCounts> {
    const view = await this.requireRoot(id, "post");
    const audience = await this.audienceScope(id, view);
    const region = await this.resolveRegion(filters, audience);
    const tierSet = narrowingTierSet(filters.tier);

    if (!region && !tierSet) {
      // Raw path (all-public / inert my-district, no tier): the existing tallies, unfiltered.
      const [byEntity, byRevision] = await reactionTallies(this.d.recordStore, id);
      return {
        entityId: id,
        reactionsByEntity: byEntity.map(rawReaction),
        reactionsByCurrentRevision: byRevision.map(rawReaction),
        filters: echoFilters(filters, { geoApplied: false, tierApplied: false }),
      };
    }

    const k = this.effectiveK(audience.jurisdiction);
    const rows = await this.d.recordStore.listReactionParticipants(id);
    const rev = await this.d.recordStore.getCurrentRevision(id);
    const f = newFilterMemos();

    const byEntity = await this.tally(rows.map((r) => ({ bucket: r.kind, ...r })), region, tierSet, k, f);
    const revRows = rev ? rows.filter((r) => r.parentRevisionHash === rev.hash) : [];
    const byRevision = await this.tally(revRows.map((r) => ({ bucket: r.kind, ...r })), region, tierSet, k, f);

    return {
      entityId: id,
      reactionsByEntity: bucketsToReactions(byEntity),
      reactionsByCurrentRevision: bucketsToReactions(byRevision),
      filters: echoFilters(filters, { geoApplied: region != null, tierApplied: tierSet != null, kAnonymityFloor: k }),
    };
  }

  async getPetitionCounts(id: string, filters: PublicReadFilters = {}): Promise<PetitionCounts> {
    const view = await this.requireRoot(id, "petition");
    const audience = await this.audienceScope(id, view);

    // Exposure gate FIRST (jurisdiction count policy): the request's raw tier set unlocks a tier-gated
    // scalar only when it is ⊆ the jurisdiction's minTier. Withheld ⇒ short-circuit (no count read).
    const exposure = this.countExposure(audience.jurisdiction, "signatures", filters.tier ?? null);
    if (!exposure.exposed) {
      return {
        entityId: id,
        signatureCount: null,
        suppressed: false,
        countGating: exposure.gating,
        countGatingNote: exposure.note,
        filters: echoFilters(filters, { geoApplied: false, tierApplied: false }),
      };
    }

    const region = await this.resolveRegion(filters, audience);
    const tierSet = narrowingTierSet(filters.tier);

    if (!region && !tierSet) {
      return {
        entityId: id,
        signatureCount: await this.d.recordStore.getPetitionSignatureCount(id),
        suppressed: false,
        countGating: exposure.gating,
        countGatingNote: exposure.note,
        filters: echoFilters(filters, { geoApplied: false, tierApplied: false }),
      };
    }

    const k = this.effectiveK(audience.jurisdiction);
    const rows = await this.d.recordStore.listSignatureParticipants(id);
    const tallied = await this.tally(rows.map((r) => ({ bucket: "signature", ...r })), region, tierSet, k, newFilterMemos());
    const b = tallied.get("signature") ?? { count: 0, suppressed: false };

    return {
      entityId: id,
      signatureCount: b.count,
      suppressed: b.suppressed,
      countGating: exposure.gating,
      countGatingNote: exposure.note,
      filters: echoFilters(filters, { geoApplied: region != null, tierApplied: tierSet != null, kAnonymityFloor: k }),
    };
  }

  async getPollCounts(id: string, filters: PublicReadFilters = {}): Promise<PollCounts> {
    const view = await this.requireRoot(id, "poll");
    const audience = await this.audienceScope(id, view);

    const exposure = this.countExposure(audience.jurisdiction, "votes", filters.tier ?? null);
    if (!exposure.exposed) {
      // Withheld: keep the option labels but null every count (no tally read).
      const results = await this.d.recordStore.getPollResults(id);
      return {
        entityId: id,
        results: results.map((r) => ({ option: r.option, count: null })),
        countGating: exposure.gating,
        countGatingNote: exposure.note,
        filters: echoFilters(filters, { geoApplied: false, tierApplied: false }),
      };
    }

    const region = await this.resolveRegion(filters, audience);
    const tierSet = narrowingTierSet(filters.tier);

    if (!region && !tierSet) {
      const results = await this.d.recordStore.getPollResults(id);
      return {
        entityId: id,
        results: results.map((r) => ({ option: r.option, count: r.count })),
        countGating: exposure.gating,
        countGatingNote: exposure.note,
        filters: echoFilters(filters, { geoApplied: false, tierApplied: false }),
      };
    }

    const k = this.effectiveK(audience.jurisdiction);
    const rows = await this.d.recordStore.listVoteParticipants(id);
    const tallied = await this.tally(rows.map((r) => ({ bucket: r.option, ...r })), region, tierSet, k, newFilterMemos());

    return {
      entityId: id,
      results: bucketsToPoll(tallied),
      countGating: exposure.gating,
      countGatingNote: exposure.note,
      filters: echoFilters(filters, { geoApplied: region != null, tierApplied: tierSet != null, kAnonymityFloor: k }),
    };
  }

  // ── Internals ────────────────────────────────────────────────────────────────────────────

  private summaryBase(view: PublicEntityView, createdAt: string, audienceScope: AudienceScope): RootSummaryBase {
    return {
      entityId: view.entityId,
      type: view.type,
      content: view.content,
      withheld: view.withheld,
      createdAt,
      audienceScope,
    };
  }

  /** Assemble the folded thread for a root of `expectedType`. 404 when absent, deleted, or a
   *  different type (e.g. a poll id requested on /posts/:id). */
  private async threadDetail(id: string, expectedType: RecordType): Promise<ThreadDetail> {
    const thread = await getThread(this.d.recordStore, id);
    if (!thread || thread.root.type !== expectedType || thread.root.isDeleted) {
      throw new ServiceError("not_found", `${expectedType} ${id} not found`);
    }
    return {
      root: thread.root,
      audienceScope: await this.audienceScope(id, thread.root),
      reactionsByEntity: thread.reactionsByEntity,
      reactionsByCurrentRevision: thread.reactionsByCurrentRevision,
      comments: thread.comments,
    };
  }

  /** Verify an entity exists, is the expected root type, and is live — for count endpoints. */
  private async requireRoot(id: string, expectedType: RecordType): Promise<PublicEntityView> {
    const view = await this.d.recordStore.getEntityStatePublic(id);
    if (!view || view.type !== expectedType || view.isDeleted) {
      throw new ServiceError("not_found", `${expectedType} ${id} not found`);
    }
    return view;
  }

  /** Audience metadata: jurisdiction (from the thread binding; platform fallback) + the entity's
   *  district extent (from its governance rules; empty ⇒ whole jurisdiction). Withheld content
   *  exposes no rules, so `appliesToDistrictIds` is empty for redacted/erased entities. */
  private async audienceScope(rootId: string, view: PublicEntityView): Promise<AudienceScope> {
    const jurisdiction = (await this.d.recordStore.getThreadJurisdiction(rootId)) ?? DEFAULT_JURISDICTION;
    const appliesToDistrictIds = rulesOf(view.content).appliesToDistrictIds ?? [];
    return { jurisdiction, appliesToDistrictIds };
  }

  /** Compile the requested coarse scope into a Region for the entity's own audience, or null when the
   *  scope implies no geo filter (all-public; my-district stays inert — no viewer identity here). The
   *  filter binds to the CURRENT boundary set (`asOf = now`), matching the current-point mode. */
  private async resolveRegion(filters: PublicReadFilters, audience: AudienceScope): Promise<Region | null> {
    return this.d.regionResolver.compileScope({
      scope: filters.scope ?? "all-public",
      jurisdictionId: audience.jurisdiction,
      appliesToDistrictIds: audience.appliesToDistrictIds,
      asOf: new Date(),
    });
  }

  /** The effective k-anonymity floor for this jurisdiction: max(platformMin, jurisdictionFloor ??
   *  platformDefault) — a deployment may only RAISE it. Read live so env/tests can tune it. */
  private effectiveK(jurisdictionId: string): number {
    const { min, default: def } = publicCountsKAnon();
    const floor = getJurisdiction(jurisdictionId).privacy?.kAnonymityFloor;
    return Math.max(min, floor ?? def);
  }

  /** Resolve the jurisdiction's PUBLIC COUNT EXPOSURE policy for one scalar (`JurisdictionConfig.counts`):
   *  - no `counts` block, or the scalar flag `true` with no `minTier` ⇒ `none` (exposed).
   *  - scalar flag `false` ⇒ `withheld` (never exposed).
   *  - scalar flag `true` with a non-empty `minTier` ⇒ `tier-gated`: exposed iff the REQUEST restricts to
   *    a tier set ⊆ `minTier` (`requestedTiers` is the raw `filters.tier`; null on list/detail, which never
   *    filter by tier, so a gated scalar is always withheld there). `gating` reports the POLICY state; the
   *    caller signals exposure by nulling the scalar (k-anon `suppressed` stays orthogonal). */
  private countExposure(
    jurisdictionId: string,
    scalar: "votes" | "signatures",
    requestedTiers: KycTier[] | null,
  ): { gating: CountGating; exposed: boolean; note: string } {
    const policy = getJurisdiction(jurisdictionId).counts;
    if (!policy) return { gating: "none", exposed: true, note: COUNT_GATING_NOTE };
    if (!policy[scalar]) return { gating: "withheld", exposed: false, note: WITHHELD_NOTE };
    const minTier = policy.minTier;
    if (!minTier || minTier.length === 0) return { gating: "none", exposed: true, note: COUNT_GATING_NOTE };
    const exposed = !!requestedTiers && requestedTiers.length > 0 && requestedTiers.every((t) => minTier.includes(t));
    return { gating: "tier-gated", exposed, note: tierGatedNote(minTier) };
  }

  /** Re-aggregate participant rows by bucket, counting only distinct participants that pass EVERY active
   *  filter (region AND tier — an absent dimension passes everyone), then suppress any bucket with
   *  `0 < count < effectiveK`. Every bucket present in `rows` appears in the result (a bucket fully
   *  filtered out reports a genuine 0, not suppressed). The participant key is the SQL views'
   *  `COALESCE(nullifier, author_pubkey)` — used for BOTH the per-dimension memos and the distinct count
   *  so a dev-path row (pubkey only) and a signed row (nullifier) for one person neither double-count nor
   *  split the cache. */
  private async tally(
    rows: { bucket: string; authorPubkey: string; nullifier: string | null; parentId: string }[],
    region: Region | null,
    tierSet: Set<KycTier> | null,
    effectiveK: number,
    memos: FilterMemos,
  ): Promise<Map<string, { count: number | null; suppressed: boolean }>> {
    const byBucket = new Map<string, Set<string>>();
    for (const r of rows) byBucket.set(r.bucket, byBucket.get(r.bucket) ?? new Set());
    for (const r of rows) {
      if (await this.passesFilters(r, region, tierSet, memos)) byBucket.get(r.bucket)!.add(participantKey(r));
    }
    const out = new Map<string, { count: number | null; suppressed: boolean }>();
    for (const [bucket, set] of byBucket) {
      const count = set.size;
      const suppressed = count > 0 && count < effectiveK;
      out.set(bucket, suppressed ? { count: null, suppressed: true } : { count, suppressed: false });
    }
    return out;
  }

  /** AND across the active dimensions: a participant counts iff they are in `region` (when geo narrows)
   *  AND their current tier is in `tierSet` (when tier narrows). Each test is memoized by participant. */
  private async passesFilters(
    row: { authorPubkey: string; nullifier: string | null; parentId: string },
    region: Region | null,
    tierSet: Set<KycTier> | null,
    memos: FilterMemos,
  ): Promise<boolean> {
    if (region && !(await this.isInRegion(row, region, memos.geo))) return false;
    if (tierSet && !tierSet.has(await this.participantTier(row, memos.tier))) return false;
    return true;
  }

  /** Memoized region membership for one participant (keyed by COALESCE(nullifier, authorPubkey)). */
  private async isInRegion(
    row: { authorPubkey: string; nullifier: string | null; parentId: string },
    region: Region,
    memo: Map<string, boolean>,
  ): Promise<boolean> {
    const key = participantKey(row);
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const inRegion = await this.d.participantGeoService.participantInRegion(refOf(row), region);
    memo.set(key, inRegion);
    return inRegion;
  }

  /** Memoized CURRENT tier for one participant (keyed by COALESCE(nullifier, authorPubkey)). Reuses the
   *  participant→userId linkage (ParticipantGeoService.resolveUserId) the geo path uses, then reads the
   *  latest attestation. An unlinkable participant or one with no attestation row is `unverified`. */
  private async participantTier(
    row: { authorPubkey: string; nullifier: string | null; parentId: string },
    memo: Map<string, KycTier>,
  ): Promise<KycTier> {
    const key = participantKey(row);
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const userId = await this.d.participantGeoService.resolveUserId(refOf(row));
    const tier = normalizeTier(userId ? await this.d.kycRepo.latestTier(userId) : null);
    memo.set(key, tier);
    return tier;
  }
}

/** Per-request memoization for the count filters, keyed by participantKey: region membership and current
 *  tier resolve at most once per distinct participant across by-entity/by-revision passes. */
interface FilterMemos {
  geo: Map<string, boolean>;
  tier: Map<string, KycTier>;
}
function newFilterMemos(): FilterMemos {
  return { geo: new Map(), tier: new Map() };
}

function refOf(row: { authorPubkey: string; nullifier: string | null; parentId: string }): ParticipantRef {
  return { authorPubkey: row.authorPubkey, nullifier: row.nullifier ?? undefined, parentId: row.parentId };
}

/** The requested tier set when it actually NARROWS, else null. Null when absent/empty, or when it
 *  contains EVERY tier (a no-op that includes `unverified` ⇒ everyone, so neither `applied.tier` nor a
 *  tier-driven k-anon floor should engage). A Set de-dupes, so `?tier=x&tier=x` behaves like a single
 *  `x`. The full check is an explicit "covers every enum value" test (not a size compare) so adding a
 *  fifth tier later can't let four arbitrary tiers masquerade as the full set. */
function narrowingTierSet(tier: KycTier[] | undefined): Set<KycTier> | null {
  if (!tier || tier.length === 0) return null;
  const set = new Set(tier);
  return KYC_TIERS.every((t) => set.has(t)) ? null : set;
}

function pageParams(f: PublicReadFilters): { limit: number; offset: number } {
  const limit = Math.min(Math.max(1, Math.trunc(f.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
  const offset = Math.max(0, Math.trunc(f.offset ?? 0));
  return { limit, offset };
}

function echoFilters(
  f: PublicReadFilters,
  opts: { geoApplied?: boolean; tierApplied?: boolean; kAnonymityFloor?: number | null } = {},
): FilterEcho {
  const scope: GeoScope = f.scope ?? "all-public";
  const geoApplied = opts.geoApplied ?? false;
  const tierApplied = opts.tierApplied ?? false;
  return {
    scope,
    tier: f.tier && f.tier.length > 0 ? [...new Set(f.tier)] : null,
    jurisdiction: f.jurisdiction ?? null,
    from: f.from ?? null,
    to: f.to ?? null,
    applied: { geo: geoApplied, tier: tierApplied, date: false },
    kAnonymityFloor: opts.kAnonymityFloor ?? null,
    note: buildNote(scope, geoApplied, tierApplied),
  };
}

function buildNote(scope: GeoScope, geoApplied: boolean, tierApplied: boolean): string {
  const parts: string[] = [];
  if (scope === "my-district" && !geoApplied) parts.push(MY_DISTRICT_NOTE);
  if (geoApplied) parts.push(GEO_APPLIED_NOTE);
  if (tierApplied) parts.push(TIER_APPLIED_NOTE);
  parts.push(DATE_NOTE);
  return parts.join(". ");
}

/** The participant dedup/membership key — mirrors the SQL views' COALESCE(nullifier, author_pubkey). */
function participantKey(r: { authorPubkey: string; nullifier: string | null }): string {
  return r.nullifier ?? r.authorPubkey;
}

/** Pass an unfiltered aggregate tally through as a count view (never suppressed). */
function rawReaction(c: ReactionCount): ReactionCountView {
  return { kind: c.kind, count: c.count };
}

function bucketsToReactions(m: Map<string, { count: number | null; suppressed: boolean }>): ReactionCountView[] {
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, v]) => (v.suppressed ? { kind, count: null, suppressed: true as const } : { kind, count: v.count }));
}

function bucketsToPoll(m: Map<string, { count: number | null; suppressed: boolean }>): PollResultView[] {
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([option, v]) => (v.suppressed ? { option, count: null, suppressed: true as const } : { option, count: v.count }));
}
