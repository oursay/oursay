import { toPublicView, type PrivateStore, type PublicEntityView, type ReactionCount } from "./private/store.js";

/** A comment with its reaction tallies and nested replies. `state` is response-safe: content
 *  is withheld (null, `withheld: true`) when the comment is redacted or erased. */
export interface ThreadComment {
  state: PublicEntityView;
  reactionsByEntity: ReactionCount[];
  reactionsByCurrentRevision: ReactionCount[];
  replies: ThreadComment[];
}

/** A root entity (post/petition/poll) with its reactions and comment tree. */
export interface Thread {
  root: PublicEntityView;
  reactionsByEntity: ReactionCount[];
  reactionsByCurrentRevision: ReactionCount[];
  comments: ThreadComment[];
}

/**
 * Fold-on-read assembly of a thread, as a PUBLIC response: the root entity, its reaction
 * tallies (both entity-pinned and current-revision-pinned), and the nested comment tree.
 * Redacted/erased nodes remain present (provably included) but their content is withheld — the
 * commitment stands in. All derived from the append-only log via the projection views.
 */
export async function getThread(store: PrivateStore, rootId: string): Promise<Thread | undefined> {
  const root = await store.getEntityState(rootId);
  if (!root) return undefined;
  const [byEntity, byRevision] = await reactionTallies(store, rootId);
  return {
    root: toPublicView(root),
    reactionsByEntity: byEntity,
    reactionsByCurrentRevision: byRevision,
    comments: await commentTree(store, rootId),
  };
}

async function commentTree(store: PrivateStore, parentId: string): Promise<ThreadComment[]> {
  const children = await store.getChildComments(parentId);
  const out: ThreadComment[] = [];
  for (const c of children) {
    if (c.isDeleted) continue; // tombstoned comments are omitted from the live tree
    const [byEntity, byRevision] = await reactionTallies(store, c.entityId);
    out.push({
      state: toPublicView(c), // content withheld here if the comment is redacted/erased
      reactionsByEntity: byEntity,
      reactionsByCurrentRevision: byRevision,
      replies: await commentTree(store, c.entityId),
    });
  }
  return out;
}

/** Reaction counts for an entity: [entity-pinned, current-revision-pinned]. */
export async function reactionTallies(
  store: PrivateStore,
  entityId: string,
): Promise<[ReactionCount[], ReactionCount[]]> {
  const byEntity = await store.getReactionCountsByEntity(entityId);
  const rev = await store.getCurrentRevision(entityId);
  const byRevision = rev ? await store.getReactionCountsByRevision(rev.hash) : [];
  return [byEntity, byRevision];
}
