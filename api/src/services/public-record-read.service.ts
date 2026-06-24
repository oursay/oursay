// Public, unauthenticated READ surface over the civic record. Thin orchestration over
// @oursay/public-record's fold-on-read projections + store queries (getThread, reactionTallies,
// getPollResults, getPetitionSignatureCount, listRootEntities) — no fold/projection logic is
// reimplemented here. Every response is built from response-safe `PublicEntityView` semantics
// (withheld content stays withheld) and carries audience-scope metadata.
//
// The geo `scope`, KYC `tier`, and date range are STUBS this phase (docs/06 §2–3): parsed and
// validated, echoed back, but not resolved — `applied: false`. Petition-signature / poll-vote
// counts are surfaced ungated in dev; production withholds them per jurisdiction/KYC policy.

import {
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
import { ServiceError } from "../errors.js";

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
const FILTER_NOTE = "geo/tier/date filtering is stubbed — parsed and echoed, not yet resolved (Phase C)";
const MY_DISTRICT_NOTE =
  "scope=my-district is inert on unauthenticated routes (no viewer identity to resolve a district); resolves nothing yet";
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

/** The stub filter echo — stable shape Phase C will populate. `applied` is always false this phase. */
export interface FilterEcho {
  scope: GeoScope;
  tier: KycTier | null;
  jurisdiction: string | null;
  from: string | null;
  to: string | null;
  applied: false;
  note: string;
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
  reactionsByEntity: ReactionCount[];
  reactionsByCurrentRevision: ReactionCount[];
  filters: FilterEcho;
}
export interface PetitionCounts {
  entityId: string;
  signatureCount: number;
  countGating: "none";
  countGatingNote: string;
  filters: FilterEcho;
}
export interface PollCounts {
  entityId: string;
  results: { option: string; count: number }[];
  countGating: "none";
  countGatingNote: string;
  filters: FilterEcho;
}

export interface PublicRecordReadServiceDeps {
  recordStore: PrivateStore;
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

  // ── Dedicated, filterable count endpoints (filters stubbed) ───────────────────────────────

  async getPostCounts(id: string, filters: PublicReadFilters = {}): Promise<PostCounts> {
    await this.requireRoot(id, "post");
    const [byEntity, byRevision] = await reactionTallies(this.d.recordStore, id);
    return { entityId: id, reactionsByEntity: byEntity, reactionsByCurrentRevision: byRevision, filters: echoFilters(filters) };
  }

  async getPetitionCounts(id: string, filters: PublicReadFilters = {}): Promise<PetitionCounts> {
    await this.requireRoot(id, "petition");
    return {
      entityId: id,
      signatureCount: await this.d.recordStore.getPetitionSignatureCount(id),
      countGating: "none",
      countGatingNote: COUNT_GATING_NOTE,
      filters: echoFilters(filters),
    };
  }

  async getPollCounts(id: string, filters: PublicReadFilters = {}): Promise<PollCounts> {
    await this.requireRoot(id, "poll");
    return {
      entityId: id,
      results: await this.d.recordStore.getPollResults(id),
      countGating: "none",
      countGatingNote: COUNT_GATING_NOTE,
      filters: echoFilters(filters),
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
}

function pageParams(f: PublicReadFilters): { limit: number; offset: number } {
  const limit = Math.min(Math.max(1, Math.trunc(f.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
  const offset = Math.max(0, Math.trunc(f.offset ?? 0));
  return { limit, offset };
}

function echoFilters(f: PublicReadFilters): FilterEcho {
  const scope: GeoScope = f.scope ?? "all-public";
  return {
    scope,
    tier: f.tier ?? null,
    jurisdiction: f.jurisdiction ?? null,
    from: f.from ?? null,
    to: f.to ?? null,
    applied: false,
    note: scope === "my-district" ? `${FILTER_NOTE}. ${MY_DISTRICT_NOTE}` : FILTER_NOTE,
  };
}
