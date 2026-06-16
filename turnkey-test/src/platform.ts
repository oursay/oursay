/** BIP32 paths for OurSay thread-scoped keys (same wallet, unique paths). */
export const MASTER_ACCOUNT_PATH = "m/44'/60'/0'/0/0";

export function threadAccountPath(threadIndex: number): string {
  if (!Number.isInteger(threadIndex) || threadIndex < 0) {
    throw new Error(`Invalid thread index: ${threadIndex}`);
  }
  // Dedicated change level for thread contexts (index = thread id).
  return `m/44'/60'/0'/1/${threadIndex}`;
}

export interface PlatformBindingPayload {
  version: 1;
  purpose: "oursay-platform-binding";
  userRef: string;
  threadId: string;
  subOrganizationId: string;
  walletId: string;
  masterPath: string;
  threadPath: string;
  issuedAt: string;
  nonce: string;
}

export function buildPlatformBindingPayload(input: {
  userRef: string;
  threadId: string;
  subOrganizationId: string;
  walletId: string;
  threadPath: string;
}): PlatformBindingPayload {
  return {
    version: 1,
    purpose: "oursay-platform-binding",
    userRef: input.userRef,
    threadId: input.threadId,
    subOrganizationId: input.subOrganizationId,
    walletId: input.walletId,
    masterPath: MASTER_ACCOUNT_PATH,
    threadPath: input.threadPath,
    issuedAt: new Date().toISOString(),
    nonce: crypto.randomUUID(),
  };
}

export function encodePlatformMessage(payload: PlatformBindingPayload): string {
  return JSON.stringify(payload);
}
