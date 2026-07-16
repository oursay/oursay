// PersonaPageService ([align-w4-api-surface] P6): the thread-scoped persona profile surface behind the
// web-app's PersonaView. A persona name maps to exactly one (pubkey, threadId); activity never
// aggregates across threads. Unknown names → 404 (not 403).

import {
  COMMENT_MAX_DEPTH,
  toPublicView,
  type EntityState,
  type PrivateStore,
} from "@oursay/public-record";
import { ServiceError } from "../errors.js";
import { resolveContentMentions } from "../helpers/resolve-mentions.js";
import type { AuthorIdentityDto, IdentityReadService, ReadResolution, ThreadGeoContext } from "./identity-read.service.js";
import type { CommentNodeDto } from "./record-detail.service.js";
import {
  rootTitleOf,
  type ActivityItemDto,
  type MentionItemDto,
  type ProfilePageService,
  type ProfileSupportDto,
} from "./profile-page.service.js";
import type { RootType } from "./public-feed.service.js";
import type { ApiViewer } from "./viewer-context.service.js";
import type { KycTier } from "../types/kyc.js";

export interface PersonaPageDto {
  name: string;
  threadId: string;
  jurisdiction: string;
  /** Root record type + title, served so the client renders the thread heading without a second
   *  fetch (the full root card is only fetched when this persona authored the root). */
  threadKind: RootType;
  threadTitle: string;
  identity: AuthorIdentityDto;
  tier: KycTier;
  isRootAuthor: boolean;
  /** Thread-scoped agree/disagree tally, computed server-side (single source — the client no longer
   *  reduces comment reactions itself). */
  support: ProfileSupportDto;
  comments: CommentNodeDto[];
  activity: ActivityItemDto[];
  /** Thread-scoped Mentions tab — related cites of this persona's user in this thread only. */
  mentions: MentionItemDto[];
}

export interface PersonaPageServiceDeps {
  recordStore: PrivateStore;
  identityReadService: IdentityReadService;
  profilePageService: ProfilePageService;
}

export class PersonaPageService {
  constructor(private readonly d: PersonaPageServiceDeps) {}

  async getPage(name: string, viewer: ApiViewer): Promise<PersonaPageDto> {
    const resolved = await this.d.recordStore.getPersonaByName(name);
    if (!resolved) throw new ServiceError("not_found", `persona ${name} not found`);

    const root = await this.d.recordStore.getEntityState(resolved.threadId);
    if (!root || root.isDeleted) throw new ServiceError("not_found", `persona ${name} not found`);

    const res = this.d.identityReadService.begin(viewer);
    const ctx = await this.rootContext(resolved.threadId, root);
    const author = await res.resolveAuthor(resolved.pubkey, ctx);

    const tree = await this.collectTree(resolved.threadId, 1);
    const editCounts = tree.length > 0 ? await this.d.recordStore.getEditCounts(collectIds(tree)) : new Map();
    const comments = await this.collectAuthoredComments(tree, resolved.pubkey, res, ctx, editCounts);
    const commentIds = comments.map((c) => c.id);
    const anchored = await this.d.recordStore.getExternallyAnchoredFlags(commentIds);
    for (const c of comments) {
      c.externallyAnchored = anchored.get(c.id) ?? false;
    }
    const activityRows = await this.d.recordStore.listAuthorActivity([resolved.pubkey], { limit: 100 });
    const activity = await this.d.profilePageService.mapAuthorActivityRows(activityRows);

    const key = await this.d.recordStore.getThreadKey(resolved.pubkey);
    let mentions: MentionItemDto[] = [];
    if (key?.userId) {
      const mentionRows = await this.d.recordStore.listMentionsForUser(key.userId, {
        entityId: resolved.threadId,
        limit: 100,
      });
      mentions = await this.d.profilePageService.mapMentionIndexRows(mentionRows, res);
    }

    const isRootAuthor = root.authorPubkey === resolved.pubkey;
    const rootView = toPublicView(root);

    // Thread-scoped support: the persona's received agree/disagree across their authored comments,
    // plus the root's reactions when they authored it. Computed here so the client doesn't re-reduce.
    let agrees = comments.reduce((n, c) => n + c.up, 0);
    let disagrees = comments.reduce((n, c) => n + c.down, 0);
    if (isRootAuthor) {
      const [rootUp, rootDown] = await this.reactionUpDown(resolved.threadId);
      agrees += rootUp;
      disagrees += rootDown;
    }

    return {
      name,
      threadId: resolved.threadId,
      jurisdiction: resolved.jurisdiction,
      threadKind: root.type as RootType,
      threadTitle: rootTitleOf(root.type, rootView.content, rootView.withheld),
      identity: author.identity,
      tier: author.tier,
      isRootAuthor,
      support: { agrees, disagrees, statements: 0, comments: comments.length },
      comments,
      activity,
      mentions,
    };
  }

  private async rootContext(threadId: string, root: EntityState): Promise<ThreadGeoContext> {
    const jurisdiction = (await this.d.recordStore.getThreadJurisdiction(threadId)) ?? "oursay-global";
    const audience = await this.d.recordStore.getEntityAudience(threadId);
    return { threadId, jurisdiction, affectedDistricts: audience.map((a) => a.districtSlug) };
  }

  private async collectAuthoredComments(
    nodes: RawNode[],
    pubkey: string,
    res: ReadResolution,
    ctx: ThreadGeoContext,
    editCounts: Map<string, number>,
  ): Promise<CommentNodeDto[]> {
    const out: CommentNodeDto[] = [];
    for (const node of nodes) {
      if (node.state.authorPubkey === pubkey) {
        out.push(await this.mapComment(node, res, ctx, editCounts));
      }
      out.push(...(await this.collectAuthoredComments(node.replies, pubkey, res, ctx, editCounts)));
    }
    return out;
  }

  private async collectTree(parentId: string, depth: number): Promise<RawNode[]> {
    if (depth > COMMENT_MAX_DEPTH) return [];
    const children = await this.d.recordStore.getChildComments(parentId);
    const out: RawNode[] = [];
    for (const c of children) {
      if (c.isDeleted) continue;
      out.push({ state: c, replies: await this.collectTree(c.entityId, depth + 1) });
    }
    return out;
  }

  private async mapComment(
    node: RawNode,
    res: ReadResolution,
    ctx: ThreadGeoContext,
    editCounts: Map<string, number>,
  ): Promise<CommentNodeDto> {
    const view = toPublicView(node.state);
    const author = await res.resolveAuthor(node.state.authorPubkey, ctx);
    const [up, down] = await this.reactionUpDown(node.state.entityId);
    const dto: CommentNodeDto = {
      id: node.state.entityId,
      author: author.author,
      handle: author.handle,
      tier: author.tier,
      official: author.official,
      authorGeo: author.authorGeo,
      ts: node.state.createdAt,
      edits: editCounts.get(node.state.entityId) ?? 0,
      externallyAnchored: false,
      signTier: node.state.signTier,
      body: view.withheld ? [] : paras(commentBody(view.content)),
      withheld: view.withheld,
      up,
      down,
      identity: author.identity,
      replies: [],
    };
    if (!view.withheld) {
      const mentions = await resolveContentMentions(this.d.recordStore, res, ctx, view.content);
      if (mentions) dto.mentions = mentions;
    }
    return dto;
  }

  private async reactionUpDown(entityId: string): Promise<[number, number]> {
    const reactions = await this.d.recordStore.getReactionCountsByEntity(entityId);
    const up = reactions.find((x) => x.kind === "check")?.count ?? 0;
    const down = reactions.find((x) => x.kind === "cross")?.count ?? 0;
    return [up, down];
  }
}

interface RawNode {
  state: EntityState;
  replies: RawNode[];
}

function collectIds(nodes: RawNode[]): string[] {
  const ids: string[] = [];
  const walk = (ns: RawNode[]): void => {
    for (const n of ns) {
      ids.push(n.state.entityId);
      walk(n.replies);
    }
  };
  walk(nodes);
  return ids;
}

function commentBody(content: unknown): string {
  return typeof (content as { body?: unknown } | null)?.body === "string"
    ? (content as { body: string }).body
    : "";
}

function paras(v: string): string[] {
  return v.length > 0 ? v.split(/\n{2,}/) : [];
}
