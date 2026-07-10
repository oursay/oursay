// ProfilePageService ([align-w4-api-surface] P4/P5): the account-level public profile surface
// behind the web-app's ProfileView. The whole profile (header, posts, activity) EXISTS ONLY for
// viewers the account's visibility admits — out-of-scope lookups 404 (not 403, docs/09 §3).
// Posts = FeedItems for authored roots (no results); activity derived from record_tx. Mentions
// deferred (no mention_index). Reuses ReadResolution for the visibility gate + feed identity.

import type { GeoStore } from "@oursay/geo";
import { toPublicView, type AuthorActivityRow, type PrivateStore, type RecordType } from "@oursay/public-record";
import { ServiceError } from "../errors.js";
import { displayNameFor, normalizeHandle } from "../helpers/handle.js";
import type { KycRepo } from "../repo/kyc.repo.js";
import type { MembershipRepo } from "../repo/membership.repo.js";
import type { ProfileRepo } from "../repo/profile.repo.js";
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

export interface ProfileRoleTagDto {
  roleLabel: string;
  placeLabel: string;
  jurisdictionId: string;
  districtSlug: string | null;
  seatHandle: string | null;
  placeKind: "jurisdiction" | "district";
}

export interface ProfileHeaderDto {
  name: string;
  /** Wire handle without the leading `@` (PublicProfile shape). */
  handle: string;
  role: string;
  roles: ProfileRoleTagDto[];
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
  /** ISO timestamp of the action. The client formats relative time (single source: relTime) so it
   *  ticks live and matches comment vocabulary — the server no longer bakes a display string. */
  ts: string;
  jurisdictionId: string;
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
  profileRepo: ProfileRepo;
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
    const roles = await this.buildRoleTags(ctx.userId, ctx.handleWire, memberships);
    return {
      name: ctx.displayName,
      handle: ctx.handleWire,
      role:
        roleLineFromTags(roles) ??
        (official ? "Official" : "Member"),
      roles,
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
    const items = await this.mapAuthorActivityRows(page, query.kinds);
    const nextCursor = rows.length > limit ? String(page[page.length - 1].seq) : null;
    return { items, nextCursor };
  }

  /** Map record_tx author-activity rows to profile/persona activity items. */
  async mapAuthorActivityRows(
    rows: AuthorActivityRow[],
    kinds?: ActivityKind[],
  ): Promise<ActivityItemDto[]> {
    const items: ActivityItemDto[] = [];
    for (const row of rows) {
      const item = await this.mapActivity(row);
      if (!item) continue;
      if (kinds && kinds.length > 0 && !kinds.includes(item.kind)) continue;
      items.push(item);
    }
    return items;
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

    // Only threads whose EFFECTIVE visibility reveals this author to THIS viewer feed the account
    // surface: a per-thread anonymous override severs the account↔thread link in both directions
    // (docs/09 §2), so a visible profile must not list that thread's posts, activity, or counts.
    // Filtering the pubkey set (one key per thread) enforces this uniformly across every tab.
    const keys = await this.d.recordStore.listThreadKeysForUser(user.id);
    const pubkeys: string[] = [];
    for (const k of keys) {
      if (await res.threadRevealed(user.id, k.threadId)) pubkeys.push(k.pubkey);
    }
    return {
      userId: user.id,
      handleWire: handle.replace(/^@/, ""),
      displayName: displayNameFor(user.handle, user.displayName) ?? handle.replace(/^@/, ""),
      createdAt: user.createdAt,
      pubkeys,
    };
  }


  private async buildRoleTags(
    userId: string,
    handle: string,
    memberships: Awaited<ReturnType<MembershipRepo["listForUser"]>>,
  ): Promise<ProfileRoleTagDto[]> {
    if (handle) {
      const seats = await this.d.geoStore.listOfficialSeatsByClaimedUserHandle(handle);
      if (seats.length > 0) {
        return seats
          .map((seat) => seatToRoleTag(seat))
          .sort((a, b) => seatSortRank(a) - seatSortRank(b));
      }
    }

    const official = memberships.find((m) => m.role === "official");
    if (!official) return [];

    if (official.representedDistrictSlug) {
      const districts = await this.d.geoStore.listDistrictsAsOf(official.jurisdictionId, new Date());
      const name =
        districts.find((d) => d.districtSlug === official.representedDistrictSlug)?.name ??
        official.representedDistrictSlug;
      const seat = await this.d.geoStore.getOfficialSeatForDistrict(
        official.jurisdictionId,
        official.representedDistrictSlug,
      );
      return [
        {
          roleLabel: "MLA",
          placeLabel: name,
          jurisdictionId: official.jurisdictionId,
          districtSlug: official.representedDistrictSlug,
          seatHandle: seat?.seatHandle ?? null,
          placeKind: "district",
        },
      ];
    }

    const profile = userId ? await this.d.profileRepo.getByUserId(userId) : null;
    const customTitle = profile?.memo?.trim();
    return [
      {
        roleLabel: customTitle && !customTitle.includes("\n") ? customTitle : "Official",
        placeLabel: jurisdictionLabelFor(official.jurisdictionId),
        jurisdictionId: official.jurisdictionId,
        districtSlug: null,
        seatHandle: null,
        placeKind: "jurisdiction",
      },
    ];
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

    const [commentCount, commentReactions] = await Promise.all([
      this.d.recordStore.countAuthoredComments(pubkeys),
      this.d.recordStore.sumAuthoredCommentReactionCounts(pubkeys),
    ]);
    agrees += commentReactions.agrees;
    disagrees += commentReactions.disagrees;
    return { agrees, disagrees, statements, comments: commentCount };
  }

  private async mapActivity(row: AuthorActivityRow): Promise<ActivityItemDto | null> {
    if (row.op === "delete") return null;

    const root = await this.d.recordStore.getEntityState(row.rootEntityId);
    const jurisdiction = (await this.d.recordStore.getThreadJurisdiction(row.rootEntityId)) ?? DEFAULT_JURISDICTION;
    const rootTitle = root ? rootTitleOf(root.type, toPublicView(root).content, toPublicView(root).withheld) : "a record";

    if (row.op === "update") {
      const kind: ActivityKind =
        row.type === "comment" ? "comment" : row.type === "post" || row.type === "result" ? "statement" : activityKindForType(row.type);
      return {
        kind,
        icon: "#ic-edit",
        text: row.type === "comment" ? `Edited a comment on “${rootTitle}”` : `Edited “${rootTitle}”`,
        ts: row.createdAt,
        jurisdictionId: jurisdiction,
        recordId: row.rootEntityId,
      };
    }

    if (row.type === "comment") {
      return {
        kind: "comment",
        text: `Commented on “${rootTitle}”`,
        ts: row.createdAt,
        jurisdictionId: jurisdiction,
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
        ts: row.createdAt,
        jurisdictionId: jurisdiction,
        recordId: row.rootEntityId,
      };
    }
    if (row.type === "vote") {
      return {
        kind: "poll",
        text: `Voted in “${rootTitle}”`,
        ts: row.createdAt,
        jurisdictionId: jurisdiction,
        recordId: row.rootEntityId,
      };
    }
    if (row.type === "petition_signature") {
      return {
        kind: "petition",
        text: `Signed “${rootTitle}”`,
        ts: row.createdAt,
        jurisdictionId: jurisdiction,
        recordId: row.rootEntityId,
      };
    }
    if (row.type === "post" || row.type === "petition" || row.type === "poll") {
      const title = rootTitleOf(row.type, row.content, false);
      return {
        kind: activityKindForType(row.type),
        text: `Posted “${title}”`,
        ts: row.createdAt,
        jurisdictionId: jurisdiction,
        recordId: row.entityId,
      };
    }
    if (row.type === "result") {
      const title = rootTitleOf(row.type, row.content, false);
      return {
        kind: "statement",
        text: `Posted “${title}”`,
        ts: row.createdAt,
        jurisdictionId: jurisdiction,
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

function parseRoleLine(role: string): { roleLabel: string; placeLabel: string } {
  const idx = role.indexOf(" · ");
  if (idx === -1) return { roleLabel: role, placeLabel: "" };
  return { roleLabel: role.slice(0, idx), placeLabel: role.slice(idx + 3) };
}

function jurisdictionLabelFor(jurisdictionId: string): string {
  if (jurisdictionId === "ab-ca-gov") return "Alberta";
  if (jurisdictionId === "oursay-global") return "OurSay Global";
  return jurisdictionId;
}

function seatToRoleTag(seat: {
  role: string;
  jurisdictionId: string;
  districtSlug: string | null;
  seatHandle: string;
  seatKind: "jurisdiction_leader" | "district_mla";
}): ProfileRoleTagDto {
  const { roleLabel, placeLabel } = parseRoleLine(seat.role);
  return {
    roleLabel,
    placeLabel,
    jurisdictionId: seat.jurisdictionId,
    districtSlug: seat.districtSlug,
    seatHandle: seat.seatHandle,
    placeKind: seat.seatKind === "district_mla" ? "district" : "jurisdiction",
  };
}

function seatSortRank(tag: ProfileRoleTagDto): number {
  if (tag.roleLabel.toLowerCase().startsWith("premier")) return 0;
  if (tag.roleLabel.toLowerCase().startsWith("platform")) return 0;
  return 1;
}

function roleLineFromTags(tags: ProfileRoleTagDto[]): string | null {
  const first = tags[0];
  if (!first) return null;
  return first.placeLabel ? `${first.roleLabel} · ${first.placeLabel}` : first.roleLabel;
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

function activityKindForType(type: RecordType): ActivityKind {
  if (type === "post" || type === "result") return "statement";
  if (type === "petition") return "petition";
  if (type === "poll") return "poll";
  return "comment";
}

export function rootTitleOf(type: RecordType, content: unknown, withheld: boolean): string {
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
