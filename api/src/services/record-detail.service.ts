// RecordDetailService ([align-w4-api-surface] P2/P3): the viewer-aware, kind-agnostic RECORD DETAIL
// surface behind the web-app's PostView (CONTRACT.md Part 1 `getRecordDetail`). One entry point folds
// a root of ANY type (post/petition/poll/result) plus its nested comment thread (depth ≤ 3) into the
// `{ detail, comments }` shape the fetch adapter passes straight through:
//   - author `identity` + `authorGeo` are resolved server-side per node via the SAME ReadResolution
//     the feed uses (raw author districts never leave the API — C6); comment authors resolve against
//     the ROOT record's geography (web-app read-model: a comment author's residence relation is to the
//     open thread, not the parent comment).
//   - count scalars (reactions / signatures / poll options) respect the jurisdiction's count-exposure
//     policy (null when withheld/tier-gated — detail never filters by tier, so a gated scalar is null).
//   - interlinks are served by ID (CONTRACT Part 2 §11): result→sourcePollId (inline), poll→resultId
//     (reverse lookup), petition→attachedPoll (inline). The adapter maps ids/attachedPoll to its flags.
//   - viewer state `_my` (reaction) and `_vote` (poll option) resolve through the viewer's OWN per-thread
//     persona keys — never anyone else's participation.
// 404 (not 403) for a missing / deleted / non-root id: the detail surface simply does not exist.

import {
  COMMENT_MAX_DEPTH,
  getJurisdiction,
  toPublicView,
  type EntityState,
  type PrivateStore,
} from "@oursay/public-record";
import { ServiceError } from "../errors.js";
import { countExposure } from "./count-exposure.js";
import type { AuthorGeoRelation, AuthorIdentityDto, IdentityReadService, ReadResolution, ThreadGeoContext } from "./identity-read.service.js";
import type { ApiViewer } from "./viewer-context.service.js";
import type { KycTier } from "../types/kyc.js";

const ROOT_TYPES = ["post", "petition", "poll", "result"] as const;
type RootType = (typeof ROOT_TYPES)[number];
const DEFAULT_JURISDICTION = "oursay-global";

/** The viewer's own reaction on an entity, mapped to the web-app's up/down. */
type MyReaction = "up" | "down" | null;

/** The detail-page root record (mirror of web-app RecordDetail; served names per CONTRACT Part 3:
 *  `type` (adapter → kind), `appliesToDistrictIds` (→ districts), interlinks by id). */
export interface RecordDetailDto {
  id: string;
  type: RootType;
  jurisdiction: string;
  tier: KycTier;
  official: boolean;
  signTier: number;
  appliesToDistrictIds: string[];
  author: string;
  handle: string;
  identity: AuthorIdentityDto;
  authorGeo: AuthorGeoRelation;
  title: string;
  body: string[];
  withheld: boolean;
  ts: string;
  edits: number;

  up?: number;
  down?: number;
  sig?: number | null;
  goal?: number | null;
  options?: { label: string; v: number | null }[];
  attachedPoll?: { question: string; options: string[] } | null;
  /** Interlinks by id (nullable). The graduation chain: petition ↔ poll ↔ result. */
  sourcePollId?: string | null;
  sourcePetitionId?: string | null;
  resultId?: string | null;

  /** Viewer's own reaction (null / absent when anonymous or no reaction). */
  _my?: MyReaction;
  /** Viewer's own voted option label on a poll (null when not voted). */
  _vote?: string | null;
}

/** One comment node (mirror of web-app CommentNode). No raw districts; `replies` nests to depth ≤ 3. */
export interface CommentNodeDto {
  author: string;
  handle: string;
  tier: KycTier;
  authorGeo: AuthorGeoRelation;
  ts: string;
  edits: number;
  signTier: number;
  body: string[];
  withheld: boolean;
  up: number;
  down: number;
  _my?: MyReaction;
  identity: AuthorIdentityDto;
  replies: CommentNodeDto[];
}

export interface RecordDetailResult {
  detail: RecordDetailDto;
  comments: CommentNodeDto[];
}

export interface RecordDetailServiceDeps {
  recordStore: PrivateStore;
  identityReadService: IdentityReadService;
}

export class RecordDetailService {
  constructor(private readonly d: RecordDetailServiceDeps) {}

  /** Full detail + comment thread for a root of any type. 404 when absent/deleted/not a root. */
  async getDetail(id: string, viewer: ApiViewer): Promise<RecordDetailResult> {
    const root = await this.requireRoot(id);
    const res = this.d.identityReadService.begin(viewer);
    const ctx = await this.rootContext(id, root);
    const my = new ViewerState(this.d.recordStore, viewer, id);

    const [detail, comments] = await Promise.all([
      this.buildDetail(root, res, ctx, my),
      this.buildComments(id, res, ctx, my),
    ]);
    return { detail, comments };
  }

  /** Just the comment forest (P3 standalone endpoint). Same 404 semantics as the detail. */
  async getComments(id: string, viewer: ApiViewer): Promise<CommentNodeDto[]> {
    const root = await this.requireRoot(id);
    const res = this.d.identityReadService.begin(viewer);
    const ctx = await this.rootContext(id, root);
    const my = new ViewerState(this.d.recordStore, viewer, id);
    return this.buildComments(id, res, ctx, my);
  }

  private async requireRoot(id: string): Promise<EntityState> {
    const root = await this.d.recordStore.getEntityState(id);
    if (!root || root.isDeleted || !isRootType(root.type)) {
      throw new ServiceError("not_found", `record ${id} not found`);
    }
    return root;
  }

  /** The thread's persona/geo scope: jurisdiction + affected seats of the ROOT (comment authors and
   *  the root author both resolve their reveal/authorGeo against this). */
  private async rootContext(id: string, root: EntityState): Promise<ThreadGeoContext> {
    const jurisdiction = (await this.d.recordStore.getThreadJurisdiction(id)) ?? DEFAULT_JURISDICTION;
    const audience = await this.d.recordStore.getEntityAudience(id);
    return { threadId: id, jurisdiction, affectedDistricts: audience.map((a) => a.districtSlug) };
  }

  private async buildDetail(
    root: EntityState,
    res: ReadResolution,
    ctx: ThreadGeoContext,
    my: ViewerState,
  ): Promise<RecordDetailDto> {
    const view = toPublicView(root);
    const type = root.type as RootType;
    const author = await res.resolveAuthor(root.authorPubkey, ctx);
    const editCounts = await this.d.recordStore.getEditCounts([root.entityId]);

    const dto: RecordDetailDto = {
      id: root.entityId,
      type,
      jurisdiction: ctx.jurisdiction,
      tier: author.tier,
      official: author.official,
      signTier: root.signTier,
      appliesToDistrictIds: ctx.affectedDistricts,
      author: author.author,
      handle: author.handle,
      identity: author.identity,
      authorGeo: author.authorGeo,
      ...titleBody(type, view.content, view.withheld),
      withheld: view.withheld,
      ts: root.createdAt,
      edits: editCounts.get(root.entityId) ?? 0,
    };

    if (type === "post" || type === "result") {
      const [up, down] = await this.reactionUpDown(root.entityId);
      dto.up = up;
      dto.down = down;
      dto._my = await my.reactionOn(root.entityId);
    }

    if (type === "petition") {
      const exposure = countExposure(ctx.jurisdiction, "signatures", null);
      dto.sig = exposure.exposed ? await this.d.recordStore.getPetitionSignatureCount(root.entityId) : null;
      dto.goal = petitionGoal(ctx.jurisdiction);
      dto.attachedPoll = attachedPollOf(view.content);
      dto._my = await my.reactionOn(root.entityId);
    }

    if (type === "poll") {
      const exposure = countExposure(ctx.jurisdiction, "votes", null);
      const labels = optionLabels(view.content);
      const counts = exposure.exposed ? await this.d.recordStore.getPollResults(root.entityId) : [];
      dto.options = labels.map((label) => ({
        label,
        v: exposure.exposed ? (counts.find((c) => c.option === label)?.count ?? 0) : null,
      }));
      dto.resultId = await this.d.recordStore.findResultForPoll(root.entityId);
      dto._vote = await my.voteOn(root.entityId);
    }

    if (type === "result") {
      const content = view.content as { sourcePollId?: unknown; sourcePetitionId?: unknown; tallies?: unknown } | null;
      dto.sourcePollId = typeof content?.sourcePollId === "string" ? content.sourcePollId : null;
      dto.sourcePetitionId = typeof content?.sourcePetitionId === "string" ? content.sourcePetitionId : null;
      const tallies = content?.tallies;
      if (Array.isArray(tallies)) {
        dto.options = tallies
          .filter((t): t is { option: string; count: number } => typeof (t as any)?.option === "string" && typeof (t as any)?.count === "number")
          .map((t) => ({ label: t.option, v: t.count }));
      }
    }

    return dto;
  }

  private async buildComments(
    rootId: string,
    res: ReadResolution,
    ctx: ThreadGeoContext,
    my: ViewerState,
  ): Promise<CommentNodeDto[]> {
    const raw = await this.collectTree(rootId, 1);
    if (raw.length === 0) return [];
    const editCounts = await this.d.recordStore.getEditCounts(flattenIds(raw));
    return Promise.all(raw.map((node) => this.mapComment(node, res, ctx, my, editCounts)));
  }

  /** Fetch the live comment subtree (deleted omitted), bounded at COMMENT_MAX_DEPTH (write-time also
   *  enforces it — this is a defensive read cap). */
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
    my: ViewerState,
    editCounts: Map<string, number>,
  ): Promise<CommentNodeDto> {
    const view = toPublicView(node.state);
    const author = await res.resolveAuthor(node.state.authorPubkey, ctx);
    const [up, down] = await this.reactionUpDown(node.state.entityId);
    const replies = await Promise.all(node.replies.map((r) => this.mapComment(r, res, ctx, my, editCounts)));
    return {
      author: author.author,
      handle: author.handle,
      tier: author.tier,
      authorGeo: author.authorGeo,
      ts: node.state.createdAt,
      edits: editCounts.get(node.state.entityId) ?? 0,
      signTier: node.state.signTier,
      body: view.withheld ? [] : paras(commentBody(view.content)),
      withheld: view.withheld,
      up,
      down,
      _my: await my.reactionOn(node.state.entityId),
      identity: author.identity,
      replies,
    };
  }

  private async reactionUpDown(entityId: string): Promise<[number, number]> {
    const reactions = await this.d.recordStore.getReactionCountsByEntity(entityId);
    const up = reactions.find((x) => x.kind === "check")?.count ?? 0;
    const down = reactions.find((x) => x.kind === "cross")?.count ?? 0;
    return [up, down];
  }
}

/** The viewer's OWN participation within one thread, resolved through their per-thread persona key.
 *  Anonymous viewers (or viewers with no persona in the thread) resolve to no participation. Memoizes
 *  the persona lookup so a full comment tree costs one thread-key read. */
class ViewerState {
  private persona: string | null | undefined;

  constructor(
    private readonly store: PrivateStore,
    private readonly viewer: ApiViewer,
    private readonly rootId: string,
  ) {}

  private async personaKey(): Promise<string | null> {
    if (this.persona !== undefined) return this.persona;
    this.persona = this.viewer.userId
      ? await this.store.getThreadKeyByUserThread(this.viewer.userId, this.rootId)
      : null;
    return this.persona;
  }

  async reactionOn(entityId: string): Promise<MyReaction> {
    const persona = await this.personaKey();
    if (!persona) return null;
    const active = await this.store.getActiveSingleton("reaction", persona, entityId);
    if (!active) return null;
    const state = await this.store.getEntityState(active.entityId);
    const kind = (state?.content as { kind?: unknown } | null)?.kind;
    if (kind === "check") return "up";
    if (kind === "cross") return "down";
    return null;
  }

  async voteOn(pollId: string): Promise<string | null> {
    const persona = await this.personaKey();
    if (!persona) return null;
    const active = await this.store.getActiveSingleton("vote", persona, pollId);
    if (!active) return null;
    const state = await this.store.getEntityState(active.entityId);
    const option = (state?.content as { option?: unknown } | null)?.option;
    return typeof option === "string" ? option : null;
  }
}

interface RawNode {
  state: EntityState;
  replies: RawNode[];
}

function flattenIds(nodes: RawNode[]): string[] {
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

function isRootType(type: string): type is RootType {
  return (ROOT_TYPES as readonly string[]).includes(type);
}

/** Per-type title/body projection (withheld content stays empty). Mirrors the feed's projection. */
function titleBody(type: RootType, content: unknown, withheld: boolean): { title: string; body: string[] } {
  if (withheld || content == null) return { title: "", body: [] };
  const c = content as Record<string, unknown>;
  if (type === "petition") return { title: str(c.title), body: paras(strOrEmpty(c.text)) };
  if (type === "poll") return { title: str(c.question), body: paras(strOrEmpty(c.description)) };
  return { title: str(c.title), body: paras(strOrEmpty(c.body)) }; // post | result
}

function commentBody(content: unknown): string {
  return strOrEmpty((content as { body?: unknown } | null)?.body);
}

function paras(v: string): string[] {
  return v.length > 0 ? v.split(/\n{2,}/) : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strOrEmpty(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function optionLabels(content: unknown): string[] {
  const options = (content as { options?: unknown } | null)?.options;
  return Array.isArray(options) ? options.filter((o): o is string => typeof o === "string") : [];
}

function attachedPollOf(content: unknown): { question: string; options: string[] } | null {
  const c = (content as { attachedPoll?: unknown } | null)?.attachedPoll as
    | { question?: unknown; options?: unknown }
    | null
    | undefined;
  if (
    c != null &&
    typeof c.question === "string" &&
    Array.isArray(c.options) &&
    c.options.every((o) => typeof o === "string")
  ) {
    return { question: c.question, options: c.options };
  }
  return null;
}

/** The petition's fixed graduation threshold (percent thresholds have no stable scalar yet ⇒ null). */
function petitionGoal(jurisdictionId: string): number | null {
  const g = getJurisdiction(jurisdictionId).graduation;
  return g && g.threshold.kind === "fixed" ? g.threshold.n : null;
}
