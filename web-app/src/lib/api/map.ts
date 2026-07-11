/**
 * Wire DTO → web-app type adapters (CONTRACT.md Part 3).
 * The backend serves canonical tokens and field names; these map to the mock-shaped
 * client types the views already consume.
 */

import type { AuthorIdentity } from "@/lib/types/identity";
import type { ActivityItem, PublicProfile } from "@/lib/types/profile";
import type { ProfileRoleTag } from "@/lib/types/role-tag";
import type {
  AttachedPoll,
  CanonicalRecordType,
  FeedItem,
  RecordDetail,
  RecordKind,
  RecordOption,
} from "@/lib/types/records";
import type {
  ActionGate,
  DistrictDetail,
  DistrictSummary,
  GateActor,
  JurisdictionGates,
  JurisdictionLevel,
  JurisdictionSummary,
  SignFloor,
} from "@/lib/types/jurisdiction";
import {
  claimedUserHandleForSeat,
  districtSeatHandle,
  inferLeaderRole,
  isSeatClaimed,
} from "@/lib/official-seat";
import type { CommentNode } from "@/lib/types/comments";
import type { MentionsMap, MentionKind, ResolvedMention } from "@/lib/types/mentions";
import type { SignTier } from "@/lib/types/sign-tier";
import type {
  AuthorGeoRelation,
  CanonicalTierToken,
  VerificationTier,
} from "@/lib/types/verification";
import { wireHandle } from "@/lib/handle";
import type { PersonaProfile } from "./persona";

/** Canonical client handle: wire form (no leading @). Persona names pass through. */
function mapWireHandle(raw: unknown): string {
  const s = String(raw);
  return wireHandle(s) ?? s.replace(/^@/, "");
}

function mapOptionalWireHandle(raw: unknown): string | null {
  if (raw == null) return null;
  return mapWireHandle(raw);
}

const MENTION_KINDS = new Set<MentionKind>(["reserved", "persona", "profile"]);

/** Pass through server `mentions` map; omit when absent/empty. */
function mapMentions(raw: unknown): MentionsMap | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: MentionsMap = {};
  for (const [nodeId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const v = value as Record<string, unknown>;
    const kind = String(v.kind ?? "");
    if (!MENTION_KINDS.has(kind as MentionKind)) continue;
    if (typeof v.display !== "string" || typeof v.isSelf !== "boolean") continue;
    const resolved: ResolvedMention = {
      display: v.display,
      kind: kind as MentionKind,
      isSelf: v.isSelf,
    };
    if (typeof v.route === "string" && v.route.length > 0) resolved.route = v.route;
    out[nodeId] = resolved;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Friendly URL slugs for known jurisdiction ids (API serves id only). */
const JURISDICTION_SLUGS: Record<string, string> = {
  "oursay-global": "global",
  "ab-ca-gov": "alberta",
};

const TOKEN_TO_TIER: Record<CanonicalTierToken, VerificationTier> = {
  unverified: 0,
  identity_verified: 1,
  residency_verified: 2,
  electoral_validated: 2,
};

const KIND_TO_TYPE: Record<RecordKind, CanonicalRecordType> = {
  statement: "post",
  petition: "petition",
  poll: "poll",
  result: "result",
};

const TYPE_TO_KIND: Record<CanonicalRecordType, RecordKind> = {
  post: "statement",
  petition: "petition",
  poll: "poll",
  result: "result",
};

export function jurisdictionSlugForId(id: string): string {
  return JURISDICTION_SLUGS[id] ?? id;
}

export function kindToWireType(kind: RecordKind): CanonicalRecordType {
  return KIND_TO_TYPE[kind];
}

export function wireTypeToKind(type: string): RecordKind {
  return TYPE_TO_KIND[type as CanonicalRecordType] ?? "statement";
}

export function tokenToTier(token: string, official = false): VerificationTier {
  if (official) return 3;
  return TOKEN_TO_TIER[token as CanonicalTierToken] ?? 0;
}

function mapIdentity(raw: Record<string, unknown>): AuthorIdentity {
  const handle = mapOptionalWireHandle(raw.handle);
  const seed = wireHandle(String(raw.seed)) ?? String(raw.seed);
  return {
    display: String(raw.display),
    handle,
    isPersona: Boolean(raw.isPersona),
    isSelf: Boolean(raw.isSelf),
    seed,
    threadId: String(raw.threadId),
    seenByOthersAs: raw.seenByOthersAs as string | undefined,
  };
}

function mapGateActor(raw: unknown): GateActor {
  if (raw === "anyone") return "anyone";
  if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.tiers)) {
      return {
        tiers: (o.tiers as string[]).map((t) => tokenToTier(t)),
      };
    }
    if (o.residencyIn === "jurisdiction") return { residencyIn: "jurisdiction" };
    if (o.role === "official") return { role: "official" };
  }
  return "anyone";
}

function mapActionGate(raw: Record<string, unknown>): ActionGate {
  const gate: ActionGate = {
    act: mapGateActor(raw.act),
    signMin: (raw.signMin as SignFloor) ?? "quick",
  };
  if (raw.officialCount != null) gate.officialCount = mapGateActor(raw.officialCount);
  if (Array.isArray(raw.deny)) gate.deny = raw.deny.map(mapGateActor);
  return gate;
}

function mapGates(raw: Record<string, unknown>): JurisdictionGates {
  const out = {} as JurisdictionGates;
  for (const key of Object.keys(raw)) {
    out[key as keyof JurisdictionGates] = mapActionGate(
      raw[key] as Record<string, unknown>,
    );
  }
  return out;
}

function mapOptions(raw: unknown): RecordOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((o) => {
    const row = o as Record<string, unknown>;
    const opt: RecordOption = { label: String(row.label), v: (row.v as number) ?? 0 };
    if (row.live != null) opt.live = row.live as number;
    return opt;
  });
}

function mapAttachedPoll(raw: unknown): AttachedPoll | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (!o.question || !Array.isArray(o.options)) return undefined;
  return { question: String(o.question), options: o.options as string[] };
}

/** Map a feed-item-shaped wire row to {@link FeedItem}. */
export function mapFeedItem(raw: Record<string, unknown>): FeedItem {
  const official = Boolean(raw.official);
  const item: FeedItem = {
    id: String(raw.id),
    kind: wireTypeToKind(String(raw.type)),
    jurisdiction: String(raw.jurisdiction),
    tier: tokenToTier(String(raw.tier), official),
    districts: (raw.appliesToDistrictIds as string[]) ?? [],
    author: String(raw.author),
    handle: mapWireHandle(raw.handle),
    title: String(raw.title),
    body: (raw.body as string[]) ?? [],
    comments: (raw.comments as number) ?? 0,
    authorGeo: raw.authorGeo as AuthorGeoRelation | undefined,
    identity: raw.identity
      ? mapIdentity(raw.identity as Record<string, unknown>)
      : undefined,
  };
  if (raw.up != null) item.up = raw.up as number;
  if (raw.down != null) item.down = raw.down as number;
  if (raw.sig != null) item.sig = raw.sig as number;
  if (raw.goal != null) item.goal = raw.goal as number;
  if (raw.edits != null) item.edits = raw.edits as number;
  if (raw.signTier != null) item.signTier = raw.signTier as SignTier;
  const opts = mapOptions(raw.options);
  if (opts) item.options = opts;
  const poll = mapAttachedPoll(raw.attachedPoll);
  if (poll) item.attachedPoll = poll;
  const mentions = mapMentions(raw.mentions);
  if (mentions) item.mentions = mentions;
  return item;
}

/** Map a record-detail-shaped wire row to {@link RecordDetail}. */
export function mapRecordDetail(raw: Record<string, unknown>): RecordDetail {
  const official = Boolean(raw.official);
  const detail: RecordDetail = {
    id: String(raw.id),
    kind: wireTypeToKind(String(raw.type)),
    jurisdiction: String(raw.jurisdiction),
    tier: tokenToTier(String(raw.tier), official),
    districts: (raw.appliesToDistrictIds as string[]) ?? [],
    author: String(raw.author),
    handle: mapWireHandle(raw.handle),
    title: String(raw.title),
    body: (raw.body as string[]) ?? [],
    ts: String(raw.ts),
    edits: (raw.edits as number) ?? 0,
    authorGeo: raw.authorGeo as AuthorGeoRelation | undefined,
    identity: raw.identity
      ? mapIdentity(raw.identity as Record<string, unknown>)
      : undefined,
  };
  if (raw.up != null) detail.up = raw.up as number;
  if (raw.down != null) detail.down = raw.down as number;
  if (raw.sig != null) detail.sig = raw.sig as number;
  if (raw.goal != null) detail.goal = raw.goal as number;
  if (raw.signTier != null) detail.signTier = raw.signTier as SignTier;
  if (raw._my != null) detail._my = raw._my as "up" | "down" | null;
  if (raw._vote != null) detail._vote = raw._vote as string | null;
  const opts = mapOptions(raw.options);
  if (opts) detail.options = opts;
  const poll = mapAttachedPoll(raw.attachedPoll);
  if (poll) detail.attachedPoll = poll;
  if (raw.sourcePetitionId) detail.sourcePetition = true;
  if (raw.sourcePollId) detail.sourcePoll = true;
  if (raw.resultId) detail.resultPublished = true;
  const mentions = mapMentions(raw.mentions);
  if (mentions) detail.mentions = mentions;
  return detail;
}

/** Map a comment-node wire row (recursive). */
export function mapCommentNode(raw: Record<string, unknown>): CommentNode {
  const official = Boolean(raw.official);
  const node: CommentNode = {
    ...(typeof raw.id === "string" ? { id: raw.id } : {}),
    author: String(raw.author),
    handle: mapWireHandle(raw.handle),
    tier: tokenToTier(String(raw.tier), official),
    ts: String(raw.ts),
    body: (raw.body as string[]) ?? [],
    up: (raw.up as number) ?? 0,
    down: (raw.down as number) ?? 0,
    replies: [],
    authorGeo: raw.authorGeo as AuthorGeoRelation | undefined,
    identity: raw.identity
      ? mapIdentity(raw.identity as Record<string, unknown>)
      : undefined,
  };
  if (raw.edits != null) node.edits = raw.edits as number;
  if (raw.signTier != null) node.signTier = raw.signTier as SignTier;
  if (raw._my != null) node._my = raw._my as "up" | "down" | null;
  const mentions = mapMentions(raw.mentions);
  if (mentions) node.mentions = mentions;
  if (Array.isArray(raw.replies)) {
    node.replies = raw.replies.map((r) =>
      mapCommentNode(r as Record<string, unknown>),
    );
  }
  return node;
}

/** Map profile header wire row to {@link PublicProfile} (tabs filled separately). */
export function mapProfileHeader(raw: Record<string, unknown>): PublicProfile {
  const official = Boolean(raw.official);
  const supportRaw = raw.support as Record<string, number> | undefined;
  const rolesRaw = Array.isArray(raw.roles) ? raw.roles : [];
  const roles: ProfileRoleTag[] = rolesRaw.map((row) => {
    const tag = row as Record<string, unknown>;
    return {
      roleLabel: String(tag.roleLabel ?? ""),
      placeLabel: String(tag.placeLabel ?? ""),
      jurisdictionId: String(tag.jurisdictionId ?? ""),
      districtSlug: tag.districtSlug == null ? null : String(tag.districtSlug),
      seatHandle: tag.seatHandle == null ? null : String(tag.seatHandle),
      placeKind: tag.placeKind === "district" ? "district" : "jurisdiction",
    };
  });
  return {
    name: String(raw.name),
    handle: mapWireHandle(raw.handle),
    role: String(raw.role ?? ""),
    roles,
    tier: tokenToTier(String(raw.tier), official),
    bio: String(raw.bio ?? ""),
    ageLabel: String(raw.ageLabel ?? ""),
    support: {
      agrees: supportRaw?.agrees ?? 0,
      disagrees: supportRaw?.disagrees ?? 0,
      statements: supportRaw?.statements ?? 0,
      comments: supportRaw?.comments ?? 0,
    },
    posts: [],
    activity: [],
    mentions: [],
  };
}

export function mapActivityItem(raw: Record<string, unknown>): ActivityItem {
  return {
    kind: raw.kind as ActivityItem["kind"],
    icon: raw.icon as string | undefined,
    text: String(raw.text),
    ts: raw.ts != null ? String(raw.ts) : undefined,
    meta: raw.meta != null ? String(raw.meta) : undefined,
    jurisdictionId: raw.jurisdictionId != null ? String(raw.jurisdictionId) : undefined,
    recordId: raw.recordId as string | undefined,
  };
}

function mapLevel(level: string): JurisdictionLevel {
  if (level === "provincial" || level === "municipal") return "province";
  return "global";
}

/** Map jurisdiction detail + district list to {@link JurisdictionSummary}. */
export function mapJurisdictionSummary(
  detail: Record<string, unknown>,
  districts: DistrictSummary[],
): JurisdictionSummary {
  const id = String(detail.id);
  const leaderRaw = detail.leader as
    | {
        name: string;
        handle: string;
        claimed?: boolean;
        claimedUserHandle?: string | null;
        leaderRole?: string;
      }
    | undefined;
  const seatHandle = leaderRaw?.handle ?? "";
  const claimedUserHandle =
    leaderRaw?.claimedUserHandle ?? claimedUserHandleForSeat(seatHandle);
  return {
    id,
    slug: jurisdictionSlugForId(id),
    name: String(detail.label ?? id),
    level: mapLevel(String(detail.level)),
    leader: leaderRaw
      ? {
          name: leaderRaw.name,
          handle: seatHandle,
          claimed: leaderRaw.claimed ?? isSeatClaimed(seatHandle),
          claimedUserHandle,
          leaderRole: inferLeaderRole({
            jurisdictionId: id,
            leaderRole: leaderRaw.leaderRole,
            seatHandle: seatHandle,
          }),
        }
      : { name: "", handle: "" },
    rules: (detail.rulesCopy as string[]) ?? [],
    gates: mapGates((detail.gates as Record<string, unknown>) ?? {}),
    districtLabel: districts.length > 0 ? "Ridings" : null,
    districts,
  };
}

export function mapDistrictSummary(
  raw: Record<string, unknown>,
  jurisdictionId?: string,
): DistrictSummary {
  const slug = String(raw.districtSlug ?? raw.slug);
  const seatFromApi = String(raw.seatHandle ?? raw.leaderHandle ?? "").trim();
  const leaderHandle =
    seatFromApi || (jurisdictionId ? districtSeatHandle(jurisdictionId, slug) : "");
  const claimedFromApi =
    raw.claimedUserHandle == null ? null : String(raw.claimedUserHandle).replace(/^@/, "");
  const claimedUserHandle = claimedFromApi ?? claimedUserHandleForSeat(leaderHandle);
  return {
    name: String(raw.name),
    slug,
    leader: String(raw.leader ?? raw.representativeName ?? ""),
    leaderHandle,
    claimedUserHandle,
    leaderClaimed:
      raw.leaderClaimed != null
        ? Boolean(raw.leaderClaimed)
        : claimedUserHandle
          ? true
          : leaderHandle
            ? isSeatClaimed(leaderHandle)
            : undefined,
  };
}

export function mapDistrictDetail(raw: Record<string, unknown>): DistrictDetail {
  const about = raw.about;
  const slug = String(raw.slug);
  const jur = String(raw.jur);
  const seatFromApi = String(raw.seatHandle ?? raw.leaderHandle ?? "").trim();
  const leaderHandle = seatFromApi || districtSeatHandle(jur, slug);
  const claimedFromApi =
    raw.claimedUserHandle == null ? null : String(raw.claimedUserHandle).replace(/^@/, "");
  const claimedUserHandle = claimedFromApi ?? claimedUserHandleForSeat(leaderHandle);
  return {
    name: String(raw.name),
    slug,
    jur,
    leader: String(raw.leader ?? raw.representativeName ?? ""),
    leaderHandle,
    claimedUserHandle,
    leaderClaimed:
      raw.leaderClaimed != null
        ? Boolean(raw.leaderClaimed)
        : claimedUserHandle
          ? true
          : leaderHandle
            ? isSeatClaimed(leaderHandle)
            : undefined,
    boundaryYear: (raw.boundaryYear as number) ?? 0,
    source: String(raw.sourceName ?? raw.source ?? ""),
    about: Array.isArray(about) ? (about as string[]) : about ? [String(about)] : [],
  };
}

export const PERSONA_BIO =
  "This member participates here under a per-thread pseudonym. Their identity, profile, and activity elsewhere stay private.";

/** Compose a {@link PersonaProfile} from the persona page wire row. Thread kind/title and the
 *  agree/disagree tally are served on the persona DTO (single source — the client no longer
 *  re-derives them from the comment reactions); `rootPost` is built by the caller only when this
 *  persona authored the thread root (the one case that still needs the record detail). */
export function mapPersonaProfile(
  raw: Record<string, unknown>,
  rootPost?: FeedItem,
): PersonaProfile {
  const comments = Array.isArray(raw.comments)
    ? raw.comments.map((c) => mapCommentNode(c as Record<string, unknown>))
    : [];
  const rawSupport = (raw.support ?? {}) as Record<string, unknown>;

  return {
    name: String(raw.name),
    threadId: String(raw.threadId),
    threadKind: wireTypeToKind(String(raw.threadKind)),
    threadTitle: String(raw.threadTitle ?? ""),
    jurisdiction: String(raw.jurisdiction ?? "oursay-global"),
    tier: tokenToTier(String(raw.tier)),
    bio: PERSONA_BIO,
    ageLabel: "this thread",
    support: {
      agrees: Number(rawSupport.agrees ?? 0),
      disagrees: Number(rawSupport.disagrees ?? 0),
      statements: Number(rawSupport.statements ?? 0),
      comments: Number(rawSupport.comments ?? comments.length),
    },
    comments,
    isRootAuthor: Boolean(raw.isRootAuthor),
    rootPost,
    activity: Array.isArray(raw.activity)
      ? raw.activity.map((row) => mapActivityItem(row as Record<string, unknown>))
      : [],
    mentions: [],
  };
}
