import { encodeEntityIdForDisplay } from "./entity-id.js";

/** WebAuthn `user.name` for a per-thread civic passkey (`userId:threadId`, Base59 when UUID). */
export function formatThreadPasskeyUserName(userId: string, threadId: string): string {
  return `${encodeEntityIdForDisplay(userId)}:${encodeEntityIdForDisplay(threadId)}`;
}

/** WebAuthn `user.displayName` for a per-thread civic passkey. */
export function formatThreadPasskeyDisplayName(threadId: string): string {
  return `OurSay thread ${encodeEntityIdForDisplay(threadId)}`;
}
