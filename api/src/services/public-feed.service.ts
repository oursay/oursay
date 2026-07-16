// PublicFeedService ([align-w4-api-surface] P1): the unified, cursor-paginated feed powering the
// web-app's FeedView (CONTRACT.md §1). One list across all four root types and every registered
// jurisdiction; every row is FeedItem-shaped so the W5 fetch adapter is mechanical:
//   - jurisdiction IDS in logic (labels resolve client-side via the served config — CONTRACT Part 3)
//   - `appliesToDistrictIds` is the served name for the record's affected seat slugs (C2; the
//     adapter maps it back to the mock's `districts`)
//   - `identity` + `authorGeo` are viewer-resolved server-side (IdentityReadService); raw author
//     districts never leave the API (C6)
//   - `tier` is the author's canonical KycTier token + `official` the role flag — the client maps
//     tokens to its numeric ladder (role ⇒ 3)
//   - petition/poll scalars respect the jurisdiction's count-exposure policy (null when withheld or
//     tier-gated — the feed never filters by tier, so a gated scalar is always null here)
//
// Filters: `types[]`, `jurisdictions[]`, `signedMin` (envelope sign-tier floor, resolved in SQL),
// `tierMin` (author verification floor, resolved per author post-query — the page over-fetches in
// batches until full). Cursor = the last row's head seq (opaque to clients).

import {
  getJurisdiction,
  toPublicView,
  type FeedRootRow,
  type PrivateStore,
  type RecordType,
} from "@oursay/public-record";
import { countExposure } from "./count-exposure.js";
import { kycRank } from "./viewer-context.service.js";
import type { ApiViewer } from "./viewer-context.service.js";
import type { AuthorGeoRelation, AuthorIdentityDto, IdentityReadService, MentionsMap, ReadResolution } from "./identity-read.service.js";
import type { KycTier } from "../types/kyc.js";
import { resolveContentMentions } from "../helpers/resolve-mentions.js";

export const ROOT_TYPES = ["post", "petition", "poll", "result"] as const;
export type RootType = (typeof ROOT_TYPES)[number];

const DEFAULT_JURISDICTION = "oursay-global";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** Over-fetch batch size while a tierMin filter drops rows. */
const SCAN_BATCH = 50;

export interface FeedQuery {
  jurisdictions?: string[];
  /** Affected district slugs (entity_audience); omitted ⇒ no district filter. */
  districts?: string[];
  types?: RootType[];
  /** Author verification floor (web-app Verified ladder): 0 any · 1 identity · 2 residency ·
   *  3 official (role, not a tier). */
  tierMin?: 0 | 1 | 2 | 3;
  /** Envelope sign-tier floor (0 any · 1 passkey; 2/3 future). */
  signedMin?: number;
  cursor?: string;
  limit?: number;
}

/** One FeedItem-shaped row (mirror of web-app/src/lib/types/records.ts FeedItem, served names). */
export interface FeedItemDto {
  id: string;
  type: RootType;
  jurisdiction: string;
  /** Author's canonical KYC tier token (client maps to its numeric ladder). */
  tier: KycTier;
  /** Author holds the official role in this row's jurisdiction. */
  official: boolean;
  signTier: number;
  /** Affected seat slugs ([] ⇒ jurisdiction-wide). Served name per C2. */
  appliesToDistrictIds: string[];
  author: string;
  handle: string;
  identity: AuthorIdentityDto;
  authorGeo: AuthorGeoRelation;
  title: string;
  body: string[];
  /** True when the content is redacted/erased (title/body empty; the row remains provably present). */
  withheld: boolean;
  /** Opaque mention token → server-resolved display/kind/route (absent when no tokens). */
  mentions?: MentionsMap;

  up?: number;
  down?: number;
  /** Null when the jurisdiction's count policy withholds/tier-gates the scalar. */
  sig?: number | null;
  goal?: number | null;
  options?: { label: string; v: number | null }[];
  attachedPoll?: { question: string; options: string[] } | null;

  comments: number;
  edits: number;
  /** Original create time, ISO (display; ordering is the cursor's concern). */
  ts: string;
  /**
   * True when this entity's create commitment is covered by an external public-witness
   * anchor (not merely settled on the internal ledger).
   */
  externallyAnchored: boolean;
}

export interface FeedResponse {
  items: FeedItemDto[];
  /** Pass back as `cursor` for the next page; null ⇒ no more rows. */
  nextCursor: string | null;
  /**
   * Full size of the filtered feed (same filters as this page), matching the
   * legacy browse-list `page.total` convention — not the size of `items`.
   */
  total: number;
}

export interface PublicFeedServiceDeps {
  recordStore: PrivateStore;
  identityReadService: IdentityReadService;
}

export class PublicFeedService {
  constructor(private readonly d: PublicFeedServiceDeps) {}

  async list(query: FeedQuery, viewer: ApiViewer): Promise<FeedResponse> {
    const limit = Math.min(Math.max(1, Math.trunc(query.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
    const tierMin = query.tierMin ?? 0;
    const res = this.d.identityReadService.begin(viewer);
    const storeFilter = {
      types: query.types as RecordType[] | undefined,
      jurisdictions: query.jurisdictions,
      districts: query.districts,
      defaultJurisdiction: DEFAULT_JURISDICTION,
      signedMin: query.signedMin,
    };

    // Page and filtered total in parallel (total matches browse-list `page.total`).
    const totalPromise = this.countFiltered(storeFilter, tierMin, viewer);

    // Scan newest-first in batches; the author-tier floor drops rows post-query, so keep fetching
    // until limit+1 rows survive (the +1 detects the next page) or the log is exhausted.
    const kept: { row: FeedRootRow; resolved: Resolved }[] = [];
    let beforeSeq = parseCursor(query.cursor);
    for (;;) {
      const rows = await this.d.recordStore.listFeedRoots({
        ...storeFilter,
        beforeSeq,
        limit: SCAN_BATCH,
      });
      for (const row of rows) {
        const resolved = await this.resolveRow(row, res);
        const rank = resolved.author.official ? 3 : kycRank(resolved.author.tier);
        if (rank >= tierMin) kept.push({ row, resolved });
        if (kept.length > limit) break;
      }
      if (kept.length > limit || rows.length < SCAN_BATCH) break;
      beforeSeq = rows[rows.length - 1].headSeq;
    }

    const page = kept.slice(0, limit);
    const [items, total] = await Promise.all([
      this.feedItemsFromRoots(page.map(({ row, resolved }) => ({ row, resolved }))),
      totalPromise,
    ]);
    const nextCursor = kept.length > limit ? String(page[page.length - 1].row.headSeq) : null;
    return { items, nextCursor, total };
  }

  /** Count roots under the same filters as {@link list} (incl. author tierMin). */
  private async countFiltered(
    storeFilter: {
      types?: RecordType[];
      jurisdictions?: string[];
      districts?: string[];
      defaultJurisdiction: string;
      signedMin?: number;
    },
    tierMin: number,
    viewer: ApiViewer,
  ): Promise<number> {
    if (tierMin <= 0) {
      return this.d.recordStore.countFeedRoots(storeFilter);
    }

    // Author tier is post-query — walk the filtered log and apply the same rank floor as list.
    const res = this.d.identityReadService.begin(viewer);
    let total = 0;
    let beforeSeq: number | undefined;
    for (;;) {
      const rows = await this.d.recordStore.listFeedRoots({
        ...storeFilter,
        beforeSeq,
        limit: SCAN_BATCH,
      });
      for (const row of rows) {
        const resolved = await this.resolveRow(row, res);
        const rank = resolved.author.official ? 3 : kycRank(resolved.author.tier);
        if (rank >= tierMin) total += 1;
      }
      if (rows.length < SCAN_BATCH) break;
      beforeSeq = rows[rows.length - 1].headSeq;
    }
    return total;
  }

  /** Build FeedItem-shaped rows for authored roots (profile Posts tab reuses this). */
  async feedItemsFromRoots(
    rows: { row: FeedRootRow; resolved?: Resolved }[],
    viewer?: ApiViewer,
  ): Promise<FeedItemDto[]> {
    if (rows.length === 0) return [];
    const res = viewer ? this.d.identityReadService.begin(viewer) : null;
    const resolved = await Promise.all(
      rows.map(async ({ row, resolved: r }) => {
        if (r) return { row, resolved: r };
        return { row, resolved: await this.resolveRow(row, res!) };
      }),
    );
    const ids = resolved.map(({ row }) => row.entityId);
    const [editCounts, commentCounts, anchored] = await Promise.all([
      this.d.recordStore.getEditCounts(ids),
      this.d.recordStore.getCommentCounts(ids),
      this.d.recordStore.getExternallyAnchoredFlags(ids),
    ]);
    return Promise.all(
      resolved.map(({ row, resolved: r }) =>
        this.toDto(row, r, editCounts, commentCounts, anchored),
      ),
    );
  }

  /** The per-row resolution the tier filter needs (author + audience), before metric queries run. */
  private async resolveRow(row: FeedRootRow, res: ReadResolution): Promise<Resolved> {
    const audienceJur = await this.d.recordStore.getEntityAudienceJurisdiction(row.entityId);
    const jurisdiction = row.jurisdiction ?? audienceJur ?? DEFAULT_JURISDICTION;
    const audience = await this.d.recordStore.getEntityAudience(row.entityId);
    const appliesToDistrictIds = audience.map((a) => a.districtSlug);
    const author = await res.resolveAuthor(row.authorPubkey, {
      threadId: row.entityId,
      jurisdiction,
      affectedDistricts: appliesToDistrictIds,
    });
    return { jurisdiction, appliesToDistrictIds, author, res };
  }

  private async toDto(
    row: FeedRootRow,
    r: Resolved,
    editCounts: Map<string, number>,
    commentCounts: Map<string, number>,
    anchored: Map<string, boolean>,
  ): Promise<FeedItemDto> {
    const view = toPublicView(row);
    const type = row.type as RootType;

    const dto: FeedItemDto = {
      id: row.entityId,
      type,
      jurisdiction: r.jurisdiction,
      tier: r.author.tier,
      official: r.author.official,
      signTier: row.signTier,
      appliesToDistrictIds: r.appliesToDistrictIds,
      author: r.author.author,
      handle: r.author.handle,
      identity: r.author.identity,
      authorGeo: r.author.authorGeo,
      ...titleBody(type, view.content, view.withheld),
      withheld: view.withheld,
      comments: commentCounts.get(row.entityId) ?? 0,
      edits: editCounts.get(row.entityId) ?? 0,
      ts: row.firstCreatedAt,
      externallyAnchored: anchored.get(row.entityId) ?? false,
    };

    if (!view.withheld) {
      const mentions = await resolveContentMentions(
        this.d.recordStore,
        r.res,
        {
          threadId: row.entityId,
          jurisdiction: r.jurisdiction,
          affectedDistricts: r.appliesToDistrictIds,
        },
        view.content,
      );
      if (mentions) dto.mentions = mentions;
    }

    if (type === "post" || type === "result") {
      const reactions = await this.d.recordStore.getReactionCountsByEntity(row.entityId);
      dto.up = reactions.find((x) => x.kind === "check")?.count ?? 0;
      dto.down = reactions.find((x) => x.kind === "cross")?.count ?? 0;
    }
    if (type === "petition") {
      const exposure = countExposure(r.jurisdiction, "signatures", null);
      dto.sig = exposure.exposed ? await this.d.recordStore.getPetitionSignatureCount(row.entityId) : null;
      dto.goal = petitionGoal(r.jurisdiction);
      const attached = (view.content as { attachedPoll?: unknown } | null)?.attachedPoll;
      dto.attachedPoll = isAttachedPoll(attached) ? attached : null;
    }
    if (type === "poll") {
      const exposure = countExposure(r.jurisdiction, "votes", null);
      const labels = optionLabels(view.content);
      const counts = exposure.exposed ? await this.d.recordStore.getPollResults(row.entityId) : [];
      dto.options = labels.map((label) => ({
        label,
        v: exposure.exposed ? (counts.find((c) => c.option === label)?.count ?? 0) : null,
      }));
    }
    if (type === "result") {
      const tallies = (view.content as { tallies?: unknown } | null)?.tallies;
      if (Array.isArray(tallies)) {
        dto.options = tallies
          .filter((t): t is { option: string; count: number } => typeof (t as any)?.option === "string" && typeof (t as any)?.count === "number")
          .map((t) => ({ label: t.option, v: t.count }));
      }
    }
    return dto;
  }
}

interface Resolved {
  jurisdiction: string;
  appliesToDistrictIds: string[];
  author: Awaited<ReturnType<ReadResolution["resolveAuthor"]>>;
  res: ReadResolution;
}

function parseCursor(cursor: string | undefined): number | undefined {
  if (!cursor) return undefined;
  const n = Number(cursor);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}

/** Per-type title/body projection onto the FeedItem shape (withheld content stays withheld). */
function titleBody(type: RootType, content: unknown, withheld: boolean): { title: string; body: string[] } {
  if (withheld || content == null) return { title: "", body: [] };
  const c = content as Record<string, unknown>;
  const paras = (v: unknown): string[] =>
    typeof v === "string" && v.length > 0 ? v.split(/\n{2,}/) : [];
  if (type === "petition") return { title: str(c.title), body: paras(c.text) };
  if (type === "poll") return { title: str(c.question), body: paras(c.description) };
  return { title: str(c.title), body: paras(c.body) }; // post | result
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function optionLabels(content: unknown): string[] {
  const options = (content as { options?: unknown } | null)?.options;
  return Array.isArray(options) ? options.filter((o): o is string => typeof o === "string") : [];
}

/** The petition's signature goal from the jurisdiction's graduation policy — a fixed threshold
 *  serves directly; a percent-of-verified threshold has no stable scalar yet (null). */
function petitionGoal(jurisdictionId: string): number | null {
  const g = getJurisdiction(jurisdictionId).graduation;
  return g && g.threshold.kind === "fixed" ? g.threshold.n : null;
}

function isAttachedPoll(v: unknown): v is { question: string; options: string[] } {
  const c = v as { question?: unknown; options?: unknown } | null;
  return (
    c != null &&
    typeof c.question === "string" &&
    Array.isArray(c.options) &&
    c.options.every((o) => typeof o === "string")
  );
}
