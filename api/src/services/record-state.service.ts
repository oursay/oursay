// RecordStateService ([align-w4-api-surface] A5): self-only batch read of the viewer's participation
// markers across a set of record ids — `_my`, `_vote`, `signed`, `shared`. Reuses ViewerState for
// reaction/vote/signature resolution through the viewer's per-thread persona keys.

import { isRootType, type PrivateStore } from "@oursay/public-record";
import { ServiceError } from "../errors.js";
import type { MyReaction } from "./viewer-state.service.js";
import { ViewerState } from "./viewer-state.service.js";
import type { ApiViewer } from "./viewer-context.service.js";

const MAX_BATCH = 100;

export interface RecordStateEntry {
  _my: MyReaction;
  /** Civic entity id of the viewer's active reaction on this parent (for upsert). */
  _myEntityId: string | null;
  _vote: string | null;
  signed: boolean;
  shared: boolean;
}

export interface RecordStateResult {
  states: Record<string, RecordStateEntry>;
}

export interface RecordStateServiceDeps {
  recordStore: PrivateStore;
}

export class RecordStateService {
  constructor(private readonly d: RecordStateServiceDeps) {}

  async getStates(ids: string[], viewer: ApiViewer): Promise<RecordStateResult> {
    if (ids.length === 0) return { states: {} };
    if (ids.length > MAX_BATCH) {
      throw new ServiceError("validation", `at most ${MAX_BATCH} ids per request`);
    }

    const unique = [...new Set(ids)];
    const shared = viewer.userId
      ? await this.d.recordStore.sharedByUser(viewer.userId, unique)
      : new Set<string>();

    const threadById = new Map<string, string>();
    for (const id of unique) {
      threadById.set(id, await this.resolveThreadId(id));
    }

    const viewerByThread = new Map<string, ViewerState>();
    const getViewer = (threadId: string): ViewerState => {
      let vs = viewerByThread.get(threadId);
      if (!vs) {
        vs = new ViewerState(this.d.recordStore, viewer, threadId);
        viewerByThread.set(threadId, vs);
      }
      return vs;
    };

    const states: Record<string, RecordStateEntry> = {};
    await Promise.all(
      unique.map(async (id) => {
        const threadId = threadById.get(id)!;
        const vs = getViewer(threadId);
        const [reactionInfo, _vote, signed] = await Promise.all([
          vs.reactionInfoOn(id),
          vs.voteOn(id),
          vs.signedPetition(id),
        ]);
        states[id] = {
          _my: reactionInfo?.dir ?? null,
          _myEntityId: reactionInfo?.entityId ?? null,
          _vote,
          signed,
          shared: shared.has(id),
        };
      }),
    );

    return { states };
  }

  /** Walk parent links to the thread root (the root entity id scopes persona keys). */
  private async resolveThreadId(entityId: string): Promise<string> {
    let cur = entityId;
    for (let depth = 0; depth < 4; depth++) {
      const state = await this.d.recordStore.getEntityState(cur);
      if (!state || state.isDeleted) return entityId;
      if (isRootType(state.type)) return state.entityId;
      if (!state.parentId) return entityId;
      cur = state.parentId;
    }
    return entityId;
  }
}
