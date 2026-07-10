/**
 * Bridge for civic thread-passkey WebAuthn phase updates → passkeyBusy overlay.
 */

import { ThreadPasskeyStore } from "@oursay/identity/client/browser";

export type CivicPasskeyPhase = "creating" | "signing";

let listener: ((phase: CivicPasskeyPhase) => void) | null = null;

export function setCivicPasskeyPhaseListener(l: typeof listener): void {
  listener = l;
}

export function notifyCivicPasskeyPhase(phase: CivicPasskeyPhase): void {
  listener?.(phase);
}

export function hasLocalThreadCredential(userId: string, threadId: string): boolean {
  return new ThreadPasskeyStore().get(userId, threadId) != null;
}
