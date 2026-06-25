// Public, unauthenticated READ surface over the civic record. Thin orchestration over
// @oursay/public-record's fold-on-read projections + store queries (getThread, reactionTallies,
// getPollResults, getPetitionSignatureCount, listRootEntities) — no fold/projection logic is
// reimplemented here. Every response is built from response-safe `PublicEntityView` semantics
// (withheld content stays withheld) and carries audience-scope metadata.
//
// The geo `scope` is RESOLVED on the count endpoints (docs/06 §2–3): compileScope → Region, then
// each participant is tested with participantInRegion and counts re-aggregate over distinct in-region
// participants, with a k-anonymity floor (`applied.geo`/`kAnonymityFloor` in the echo). KYC `tier` and
// the date range are still STUBS — parsed/validated and echoed (`applied.tier`/`applied.date` false),
// not resolved, until [mvp-c-kyc-stub]. Lists + thread detail apply no geo filter. Petition-signature /
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
import type { ParticipantGeoService, ParticipantRef } from "./participant-geo.service.js";

/** The four coarse geographic audiences (fixed enum — no freeform district ids, which would invite
 *  the cross-boundary triangulation docs/06 §2–3 warns against). */
export type GeoScope = "jurisdiction" | "impacted-region" | "my-district" | "all-public";
export const GEO_SCOPES: GeoScope[] = ["jurisdiction", "impacted-region", "my-district", "all-public"];

/** Canonical KYC verification tiers (docs/01 §4; KycRepo VERIFIED_TIERS). Enum-validated even
 *  though tier filtering is stubbed — a freeform string invites drift. */
export type KycTier = "unverified" | "identity_verified" | "residency_verified" | "electoral_validated";
export const KYC_TIERS: KycTier[] = ["unverified", "identity_verified", "residency_verified", "electoral_validated"];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_JURISDICTION = "oursay-global";
const TIER_DATE_NOTE =
  "tier and date filters are stubbed — parsed and echoed, not resolved (awaits [mvp-c-kyc-stub])";
const GEO_APPLIED_NOTE =
  "geo scope resolved to a region; counts reflect distinct in-region participants only";
const MY_DISTRICT_NOTE =
  "scope=my-district is inert on unauthenticated routes (no viewer identity to resolve a district); no geo filter applied";
const COUNT_GATING_NOTE =
  "vote/signature counts are ungated in dev; production withholds them per jurisdiction/KYC policy regardless of public-voting config";

/** Read filters as received from the HTTP layer (already enum-validated by JSON schema). */
export interface PublicReadFilters {
  scope?: GeoScope;
  tier?: KycTier;
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

/** Per-dimension applied status. `geo` is live (this phase); `tier`/`date` stay false until
 *  [mvp-c-kyc-stub]. */
export interface AppliedDimensions {
  geo: boolean;
  tier: false;
  date: false;
}

/** The filter echo. `applied.geo` is true only when a non-null Region was compiled and used to narrow
 *  the count. `kAnonymityFloor` is the effective floor applied to a geo-scoped count payload, or null
 *  (lists, all-public, inert my-district). */
export interface FilterEcho {
  scope: GeoScope;
  tier: KycTier | null;
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
  signatureCount: number;
}
export interface PollSummary extends RootSummaryBase {
  results: { option: string; count: number }[];
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
  signatureCount: number;
}
export interface PollDetail extends ThreadDetail {
  results: { option: string; count: number }[];
}

export interface PostCounts {
  entityId: string;
  reactionsByEntity: ReactionCountView[];
  reactionsByCurrentRevision: ReactionCountView[];
  filters: FilterEcho;
}
export interface PetitionCounts {
  entityId: string;
  signatureCount: number | null;
  /** True when the geo-scoped signature count was suppressed by the k-anonymity floor. */
  suppressed: boolean;
  countGating: "none";
  countGatingNote: string;
  filters: FilterEcho;
}
export interface PollCounts {
  entityId: string;
  results: PollResultView[];
  countGating: "none";
  countGatingNote: string;
  filters: FilterEcho;
}

export interface PublicRecordReadServiceDeps {
  recordStore: PrivateStore;
  regionResolver: RegionResolver;
  participantGeoService: ParticipantGeoService;
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
        const signatureCount = await this.d.recordStore.getPetitionSignatureCount(row.entityId);
        return { ...this.summaryBase(view, row.createdAt, await this.audienceScope(row.entityId, view)), signatureCount };
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
        const results = await this.d.recordStore.getPollResults(row.entityId);
        return { ...this.summaryBase(view, row.createdAt, await this.audienceScope(row.entityId, view)), results };
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
    return { ...base, signatureCount: await this.d.recordStore.getPetitionSignatureCount(id) };
  }

  async getPoll(id: string): Promise<PollDetail> {
    const base = await this.threadDetail(id, "poll");
    return { ...base, results: await this.d.recordStore.getPollResults(id) };
  }

  // ── Dedicated count endpoints (geo scope resolved + k-anonymity; tier/date stubbed) ───────

  async getPostCounts(id: string, filters: PublicReadFilters = {}): Promise<PostCounts> {
    const view = await this.requireRoot(id, "post");
    const audience = await this.audienceScope(id, view);
    const region = await this.resolveRegion(filters, audience);

    if (!region) {
      // Raw path (all-public / inert my-district): the existing tallies, unfiltered.
      const [byEntity, byRevision] = await reactionTallies(this.d.recordStore, id);
      return {
        entityId: id,
        reactionsByEntity: byEntity.map(rawReaction),
        reactionsByCurrentRevision: byRevision.map(rawReaction),
        filters: echoFilters(filters, { geoApplied: false }),
      };
    }

    const k = this.effectiveK(audience.jurisdiction);
    const rows = await this.d.recordStore.listReactionParticipants(id);
    const rev = await this.d.recordStore.getCurrentRevision(id);
    const memo = new Map<string, boolean>();

    const byEntity = await this.tally(rows.map((r) => ({ bucket: r.kind, ...r })), region, k, memo);
    const revRows = rev ? rows.filter((r) => r.parentRevisionHash === rev.hash) : [];
    const byRevision = await this.tally(revRows.map((r) => ({ bucket: r.kind, ...r })), region, k, memo);

    return {
      entityId: id,
      reactionsByEntity: bucketsToReactions(byEntity),
      reactionsByCurrentRevision: bucketsToReactions(byRevision),
      filters: echoFilters(filters, { geoApplied: true, kAnonymityFloor: k }),
    };
  }

  async getPetitionCounts(id: string, filters: PublicReadFilters = {}): Promise<PetitionCounts> {
    const view = await this.requireRoot(id, "petition");
    const audience = await this.audienceScope(id, view);
    const region = await this.resolveRegion(filters, audience);

    if (!region) {
      return {
        entityId: id,
        signatureCount: await this.d.recordStore.getPetitionSignatureCount(id),
        suppressed: false,
        countGating: "none",
        countGatingNote: COUNT_GATING_NOTE,
        filters: echoFilters(filters, { geoApplied: false }),
      };
    }

    const k = this.effectiveK(audience.jurisdiction);
    const rows = await this.d.recordStore.listSignatureParticipants(id);
    const memo = new Map<string, boolean>();
    const tallied = await this.tally(rows.map((r) => ({ bucket: "signature", ...r })), region, k, memo);
    const b = tallied.get("signature") ?? { count: 0, suppressed: false };

    return {
      entityId: id,
      signatureCount: b.count,
      suppressed: b.suppressed,
      countGating: "none",
      countGatingNote: COUNT_GATING_NOTE,
      filters: echoFilters(filters, { geoApplied: true, kAnonymityFloor: k }),
    };
  }

  async getPollCounts(id: string, filters: PublicReadFilters = {}): Promise<PollCounts> {
    const view = await this.requireRoot(id, "poll");
    const audience = await this.audienceScope(id, view);
    const region = await this.resolveRegion(filters, audience);

    if (!region) {
      const results = await this.d.recordStore.getPollResults(id);
      return {
        entityId: id,
        results: results.map((r) => ({ option: r.option, count: r.count })),
        countGating: "none",
        countGatingNote: COUNT_GATING_NOTE,
        filters: echoFilters(filters, { geoApplied: false }),
      };
    }

    const k = this.effectiveK(audience.jurisdiction);
    const rows = await this.d.recordStore.listVoteParticipants(id);
    const memo = new Map<string, boolean>();
    const tallied = await this.tally(rows.map((r) => ({ bucket: r.option, ...r })), region, k, memo);

    return {
      entityId: id,
      results: bucketsToPoll(tallied),
      countGating: "none",
      countGatingNote: COUNT_GATING_NOTE,
      filters: echoFilters(filters, { geoApplied: true, kAnonymityFloor: k }),
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

  /** Re-aggregate participant rows by bucket, counting only distinct in-region participants, then
   *  suppress any bucket with `0 < count < effectiveK`. Every bucket present in `rows` appears in the
   *  result (a bucket fully out-of-region reports a genuine 0, not suppressed). The participant key is
   *  the SQL views' `COALESCE(nullifier, author_pubkey)` — used for BOTH the membership memo and the
   *  distinct count so a dev-path row (pubkey only) and a signed row (nullifier) for one person neither
   *  double-count nor split the cache. */
  private async tally(
    rows: { bucket: string; authorPubkey: string; nullifier: string | null; parentId: string }[],
    region: Region,
    effectiveK: number,
    memo: Map<string, boolean>,
  ): Promise<Map<string, { count: number | null; suppressed: boolean }>> {
    const inRegionByBucket = new Map<string, Set<string>>();
    for (const r of rows) inRegionByBucket.set(r.bucket, inRegionByBucket.get(r.bucket) ?? new Set());
    for (const r of rows) {
      if (await this.isInRegion(r, region, memo)) inRegionByBucket.get(r.bucket)!.add(participantKey(r));
    }
    const out = new Map<string, { count: number | null; suppressed: boolean }>();
    for (const [bucket, set] of inRegionByBucket) {
      const count = set.size;
      const suppressed = count > 0 && count < effectiveK;
      out.set(bucket, suppressed ? { count: null, suppressed: true } : { count, suppressed: false });
    }
    return out;
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
    const ref: ParticipantRef = {
      authorPubkey: row.authorPubkey,
      nullifier: row.nullifier ?? undefined,
      parentId: row.parentId,
    };
    const inRegion = await this.d.participantGeoService.participantInRegion(ref, region);
    memo.set(key, inRegion);
    return inRegion;
  }
}

function pageParams(f: PublicReadFilters): { limit: number; offset: number } {
  const limit = Math.min(Math.max(1, Math.trunc(f.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
  const offset = Math.max(0, Math.trunc(f.offset ?? 0));
  return { limit, offset };
}

function echoFilters(
  f: PublicReadFilters,
  opts: { geoApplied?: boolean; kAnonymityFloor?: number | null } = {},
): FilterEcho {
  const scope: GeoScope = f.scope ?? "all-public";
  const geoApplied = opts.geoApplied ?? false;
  return {
    scope,
    tier: f.tier ?? null,
    jurisdiction: f.jurisdiction ?? null,
    from: f.from ?? null,
    to: f.to ?? null,
    applied: { geo: geoApplied, tier: false, date: false },
    kAnonymityFloor: opts.kAnonymityFloor ?? null,
    note: buildNote(scope, geoApplied),
  };
}

function buildNote(scope: GeoScope, geoApplied: boolean): string {
  if (scope === "my-district") return `${MY_DISTRICT_NOTE}. ${TIER_DATE_NOTE}`;
  if (geoApplied) return `${GEO_APPLIED_NOTE}. ${TIER_DATE_NOTE}`;
  return TIER_DATE_NOTE;
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
