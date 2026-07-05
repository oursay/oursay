// ViewerState ([align-w4-api-surface] A5 + P2/P3): the viewer's OWN participation within one thread,
// resolved through their per-thread persona key. Anonymous viewers (or viewers with no persona in the
// thread) resolve to no participation. Memoizes the persona lookup so a full comment tree costs one
// thread-key read.

import type { PrivateStore } from "@oursay/public-record";
import type { ApiViewer } from "./viewer-context.service.js";

/** The viewer's own reaction on an entity, mapped to the web-app's up/down. */
export type MyReaction = "up" | "down" | null;

export class ViewerState {
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

  async signedPetition(petitionId: string): Promise<boolean> {
    const persona = await this.personaKey();
    if (!persona) return false;
    const active = await this.store.getActiveSingleton("petition_signature", persona, petitionId);
    return active != null;
  }
}
