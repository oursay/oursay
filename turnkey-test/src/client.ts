import { Turnkey, DEFAULT_ETHEREUM_ACCOUNTS } from "@turnkey/sdk-server";
import type { TurnkeyCredentials } from "./config.js";

export { DEFAULT_ETHEREUM_ACCOUNTS };

export function createTurnkeyClient(credentials: TurnkeyCredentials) {
  return new Turnkey({
    apiBaseUrl: "https://api.turnkey.com",
    apiPublicKey: credentials.apiPublicKey,
    apiPrivateKey: credentials.apiPrivateKey,
    defaultOrganizationId: credentials.organizationId,
    activityPoller: {
      intervalMs: 1_000,
      numRetries: 15,
    },
  }).apiClient();
}

export type TurnkeyApi = ReturnType<typeof createTurnkeyClient>;

export function createParentTurnkeyClient(credentials: TurnkeyCredentials) {
  return createTurnkeyClient(credentials);
}

export function createSubOrgTurnkeyClient(
  credentials: TurnkeyCredentials,
  subOrganizationId: string,
) {
  return new Turnkey({
    apiBaseUrl: "https://api.turnkey.com",
    apiPublicKey: credentials.apiPublicKey,
    apiPrivateKey: credentials.apiPrivateKey,
    defaultOrganizationId: subOrganizationId,
    activityPoller: {
      intervalMs: 1_000,
      numRetries: 15,
    },
  }).apiClient();
}

export function unwrapActivityResult<T extends Record<string, unknown>>(
  response: unknown,
  resultKey: string,
): T {
  const data = response as Record<string, unknown> & {
    activity?: { status?: string; result?: Record<string, unknown> };
  };

  const nested = data.activity?.result?.[resultKey];
  if (nested && typeof nested === "object") {
    return nested as T;
  }

  const knownKeys = new Set([
    "subOrganizationId",
    "wallet",
    "rootUserIds",
    "walletId",
    "addresses",
    "r",
    "s",
    "v",
  ]);
  if (Object.keys(data).some((key) => knownKeys.has(key))) {
    return data as T;
  }

  throw new Error(
    `Turnkey activity missing ${resultKey} (status: ${data.activity?.status ?? "unknown"})`,
  );
}

export function pickFirstAddress(addresses: string[] | undefined): string {
  const address = addresses?.[0];
  if (!address) {
    throw new Error("Expected at least one derived address");
  }
  return address;
}
