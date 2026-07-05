// ProfilePageService ([align-w4-api-surface] P4/P5): the account-level public profile surface
// behind the web-app's ProfileView. The whole profile (header, posts, activity) EXISTS ONLY for
// viewers the account's visibility admits — out-of-scope lookups 404 (not 403, docs/09 §3).
// Posts = FeedItems for authored roots (no results); activity derived from record_tx. Mentions
// deferred (no mention_index). Reuses ReadResolution for the visibility gate + feed identity.

import type { GeoStore } from "@oursay/geo";
import { toPublicView, type AuthorActivityRow, type FeedRootRow, type PrivateStore, type RecordType } from "@oursay/public-record";
import { ServiceError } from "../errors.js";
import { displayNameFor, normalizeHandle } from "../helpers/handle.js";
import type { KycRepo } from "../repo/kyc.repo.js";
import type { MembershipRepo } from "../repo/membership.repo.js";
import type { UserRepo } from "../repo/user.repo.js";
import type { KycTier } from "../types/kyc.js";
import { normalizeTier } from "../types/kyc.js";
import type { IdentityReadService } from "./identity-read.service.js";
import type { FeedItemDto, PublicFeedService, RootType } from "./public-feed.service.js";
import type { ApiViewer } from "./viewer-context.service.js";

const DEFAULT_JURISDICTION = "oursay-global";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** Profile posts exclude results — a Result is a system outcome, not a user post. */
export const PROFILE_POST_TYPES: RootType[] = ["post", "petition", "poll"];

export type ActivityKind = "statement" | "comment" | "petition" | "poll" | "reaction";

export const ACTIVITY_KINDS: ActivityKind[] = ["statement", "comment", "petition", "poll", "reaction"];

export interface ProfileSupportDto {
  agrees: number;
  disagrees: number;
  statements: number;
  comments: number;
}

export interface ProfileHeaderDto {
  name: string;
  /** Wire handle without the leading `@` (PublicProfile shape). */
  handle: string;
  role: string;
  tier: KycTier;
  official: boolean;
  bio: string;
  ageLabel: string;
  support: ProfileSupportDto;
}

export interface ActivityItemDto {
  kind: ActivityKind;
  icon?: string;
  text: string;
  meta: string;
  recordId?: string;
}

export interface ProfilePostsQuery {
  types?: RootType[];
  cursor?: string;
  limit?: number;
}

export interface ProfileActivityQuery {
  kinds?: ActivityKind[];
  cursor?: string;
  limit?: number;
}

export interface ProfilePageServiceDeps {
  recordStore: PrivateStore;
  userRepo: UserRepo;
  kycRepo: KycRepo;
  membershipRepo: MembershipRepo;
  geoStore: GeoStore;
  identityReadService: IdentityReadService;
  publicFeedService: PublicFeedService;
}

export class ProfilePageService {
  constructor(private readonly d: ProfilePageServiceDeps) {}

  async getHeader(handleRaw: string, viewer: ApiViewer): Promise<ProfileHeaderDto> {
    const ctx = await this.requireVisible(handleRaw, viewer);
    const [tierRaw, memberships, support] = await Promise.all([
      this.d.kycRepo.latestTier(ctx.userId),
      this.d.membershipRepo.listForUser(ctx.userId),
      this.computeSupport(ctx.pubkeys),
    ]);
    const tier = normalizeTier(tierRaw);
    const official = memberships.some((m) => m.role === "official");
    return {
      name: ctx.displayName,
      handle: ctx.handleWire,
      role: await this.formatRole(memberships),
      tier,
      official,
      bio: "",
      ageLabel: formatAgeLabel(ctx.createdAt),
      support,
    };
  }

  async listPosts(handleRaw: string, viewer: ApiViewer, query: ProfilePostsQuery): Promise<{ items: FeedItemDto[]; nextCursor: string | null }> {
    const ctx = await this.requireVisible(handleRaw, viewer);
    const limit = clampLimit(query.limit);
    const types = (query.types ?? PROFILE_POST_TYPES).filter((t) => PROFILE_POST_TYPES.includes(t));
    const beforeSeq = parseCursor(query.cursor);
    const rows = await this.d.recordStore.listAuthorRoots({
      pubkeys: ctx.pubkeys,
      types: types as RecordType[],
      beforeSeq,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const items = await this.d.publicFeedService.feedItemsFromRoots(page.map((row) => ({ row })), viewer);
    const nextCursor = rows.length > limit ? String(page[page.length - 1].headSeq) : null;
    return { items, nextCursor };
  }

  async listActivity(
    handleRaw: string,
    viewer: ApiViewer,
    query: ProfileActivityQuery,
  ): Promise<{ items: ActivityItemDto[]; nextCursor: string | null }> {
    const ctx = await this.requireVisible(handleRaw, viewer);
    const limit = clampLimit(query.limit);
    const beforeSeq = parseCursor(query.cursor);
    const rows = await this.d.recordStore.listAuthorActivity(ctx.pubkeys, {
      beforeSeq,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const items: ActivityItemDto[] = [];
    for (const row of page) {
      const item = await this.mapActivity(row);
      if (!item) continue;
      if (query.kinds && query.kinds.length > 0 && !query.kinds.includes(item.kind)) continue;
      items.push(item);
    }
    const nextCursor = rows.length > limit ? String(page[page.length - 1].seq) : null;
    return { items, nextCursor };
  }

  private async requireVisible(handleRaw: string, viewer: ApiViewer): Promise<ProfileCtx> {
    const handle = normalizeHandle(handleRaw);
    if (!handle) throw new ServiceError("not_found", "profile not found");
    const user = await this.d.userRepo.getByHandle(handle);
    if (!user) throw new ServiceError("not_found", "profile not found");

    const res = this.d.identityReadService.begin(viewer);
    if (!(await res.profileVisible(user.id))) {
      throw new ServiceError("not_found", "profile not found");
    }

    const pubkeys = await this.d.recordStore.listPubkeysForUser(user.id);
    return {
      userId: user.id,
      handleWire: handle.replace(/^@/, ""),
      displayName: displayNameFor(user.handle, user.displayName) ?? handle.replace(/^@/, ""),
      createdAt: user.createdAt,
      pubkeys,
    };
  }

  private async formatRole(memberships: Awaited<ReturnType<MembershipRepo["listForUser"]>>): Promise<string> {
    const official = memberships.find((m) => m.role === "official" && m.representedDistrictSlug);
    if (!official?.representedDistrictSlug) {
      return memberships.some((m) => m.role === "official") ? "Official" : "Member";
    }
    const districts = await this.d.geoStore.listDistrictsAsOf(official.jurisdictionId, new Date());
    const name = districts.find((d) => d.districtSlug === official.representedDistrictSlug)?.name;
    return name ? `MLA · ${name}` : `MLA · ${official.representedDistrictSlug}`;
  }

  private async computeSupport(pubkeys: string[]): Promise<ProfileSupportDto> {
    if (pubkeys.length === 0) return { agrees: 0, disagrees: 0, statements: 0, comments: 0 };

    const roots = await this.d.recordStore.listAuthorRoots({
      pubkeys,
      types: ["post", "petition", "poll", "result"],
      limit: 500,
    });
    let agrees = 0;
    let disagrees = 0;
    let statements = 0;
    for (const root of roots) {
      if (root.type === "post" || root.type === "result") statements++;
      if (root.type === "post" || root.type === "result") {
        const reactions = await this.d.recordStore.getReactionCountsByEntity(root.entityId);
        agrees += reactions.find((x) => x.kind === "check")?.count ?? 0;
        disagrees += reactions.find((x) => x.kind === "cross")?.count ?? 0;
      }
    }

    const commentCount = await this.d.recordStore.countAuthoredComments(pubkeys);
    return { agrees, disagrees, statements, comments: commentCount };
  }

  private async mapActivity(row: AuthorActivityRow): Promise<ActivityItemDto | null> {
    if (row.op === "delete") return null;

    const root = await this.d.recordStore.getEntityState(row.rootEntityId);
    const jurisdiction = (await this.d.recordStore.getThreadJurisdiction(row.rootEntityId)) ?? DEFAULT_JURISDICTION;
    const audience = await this.d.recordStore.getEntityAudience(row.rootEntityId);
    const rootTitle = root ? rootTitleOf(root.type, toPublicView(root).content, toPublicView(root).withheld) : "a record";

    if (row.op === "update") {
      const kind: ActivityKind =
        row.type === "comment" ? "comment" : row.type === "post" || row.type === "result" ? "statement" : activityKindForType(row.type);
      return {
        kind,
        icon: "#ic-edit",
        text: row.type === "comment" ? `Edited a comment on “${rootTitle}”` : `Edited “${rootTitle}”`,
        meta: relMeta(row.createdAt, jurisdiction),
        recordId: row.rootEntityId,
      };
    }

    if (row.type === "comment") {
      return {
        kind: "comment",
        text: `Commented on “${rootTitle}”`,
        meta: relMeta(row.createdAt, jurisdiction),
        recordId: row.rootEntityId,
      };
    }
    if (row.type === "reaction") {
      const kind = (row.content as { kind?: string } | null)?.kind;
      const agreed = kind === "check";
      return {
        kind: "reaction",
        icon: agreed ? "#ic-check" : "#ic-x",
        text: `${agreed ? "Agreed" : "Disagreed"} with “${rootTitle}”`,
        meta: relMeta(row.createdAt, jurisdiction),
        recordId: row.rootEntityId,
      };
    }
    if (row.type === "vote") {
      return {
        kind: "poll",
        text: `Voted in “${rootTitle}”`,
        meta: relMeta(row.createdAt, jurisdiction),
        recordId: row.rootEntityId,
      };
    }
    if (row.type === "petition_signature") {
      return {
        kind: "petition",
        text: `Signed “${rootTitle}”`,
        meta: relMeta(row.createdAt, jurisdiction),
        recordId: row.rootEntityId,
      };
    }
    if (row.type === "post" || row.type === "petition" || row.type === "poll") {
      const title = rootTitleOf(row.type, row.content, false);
      return {
        kind: activityKindForType(row.type),
        text: `Posted “${title}”`,
        meta: relMeta(row.createdAt, jurisdiction),
        recordId: row.entityId,
      };
    }
    if (row.type === "result") {
      const title = rootTitleOf(row.type, row.content, false);
      return {
        kind: "statement",
        text: `Posted “${title}”`,
        meta: relMeta(row.createdAt, jurisdiction),
        recordId: row.entityId,
      };
    }
    return null;
  }
}

interface ProfileCtx {
  userId: string;
  handleWire: string;
  displayName: string;
  createdAt: string;
  pubkeys: string[];
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(1, Math.trunc(limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
}

function parseCursor(cursor: string | undefined): number | undefined {
  if (!cursor) return undefined;
  const n = Number(cursor);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}

function formatAgeLabel(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const days = Math.max(0, Math.floor(ms / 86_400_000));
  if (days < 14) return `${Math.max(1, days)} days`;
  if (days < 365) {
    const months = Math.max(1, Math.floor(days / 30));
    return `${months} ${months === 1 ? "month" : "months"}`;
  }
  const years = Math.max(1, Math.floor(days / 365));
  return `${years} ${years === 1 ? "year" : "years"}`;
}

function relMeta(iso: string, jurisdiction: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  const rel = days === 0 ? "today" : `${days}d`;
  return jurisdiction === DEFAULT_JURISDICTION ? rel : `${rel} · ${jurisdiction}`;
}

function activityKindForType(type: RecordType): ActivityKind {
  if (type === "post" || type === "result") return "statement";
  if (type === "petition") return "petition";
  if (type === "poll") return "poll";
  return "comment";
}

function rootTitleOf(type: RecordType, content: unknown, withheld: boolean): string {
  if (withheld || content == null) return "Untitled";
  const c = content as Record<string, unknown>;
  if (type === "petition") return truncate(str(c.title));
  if (type === "poll") return truncate(str(c.question));
  return truncate(str(c.title));
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function truncate(v: string, max = 42): string {
  return v.length <= max ? v : `${v.slice(0, max)}…`;
}
