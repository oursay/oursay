import { keccak_256 } from "@noble/hashes/sha3";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_ETHEREUM_ACCOUNTS,
  createParentTurnkeyClient,
  createSubOrgTurnkeyClient,
  pickFirstAddress,
  unwrapActivityResult,
} from "./client.js";
import { loadTurnkeyCredentials } from "./config.js";
import {
  buildPlatformBindingPayload,
  encodePlatformMessage,
  threadAccountPath,
} from "./platform.js";

export interface UserWalletProvision {
  subOrganizationId: string;
  rootUserIds: string[];
  walletId: string;
  masterAddress: string;
  threadAddress: string;
  threadPath: string;
}

export interface SignAndIdentifyResult {
  activityId: string;
  fingerprint: string;
  signWith: string;
  signature: { r: string; s: string; v: string };
  bindingDigest: string;
  inferredUser: {
    subOrganizationId: string;
    walletId: string;
    masterAddress: string;
    threadAddress: string;
    threadPath: string;
    publicKey?: string;
  };
}

export async function provisionUserWallet(
  userRef: string,
): Promise<UserWalletProvision> {
  const credentials = loadTurnkeyCredentials();
  const parentClient = createParentTurnkeyClient(credentials);
  const threadPath = threadAccountPath(7);

  const createSubOrg = await parentClient.createSubOrganization({
    organizationId: credentials.organizationId,
    subOrganizationName: `oursay-test-${userRef.slice(0, 8)}-${Date.now()}`,
    rootUsers: [
      {
        userName: "OurSay Test User",
        userEmail: `${userRef}@oursay.test`,
        apiKeys: [
          {
            apiKeyName: "OurSay Backend",
            publicKey: credentials.apiPublicKey,
            curveType: "API_KEY_CURVE_SECP256K1",
          },
        ],
        authenticators: [],
        oauthProviders: [],
      },
    ],
    rootQuorumThreshold: 1,
    wallet: {
      walletName: "Master HD Wallet",
      accounts: DEFAULT_ETHEREUM_ACCOUNTS,
    },
  });

  const subResult = unwrapActivityResult<{
    subOrganizationId?: string;
    wallet?: { walletId: string; addresses?: string[] };
    rootUserIds?: string[];
  }>(createSubOrg, "createSubOrganizationResultV7");

  const subOrganizationId = subResult.subOrganizationId;
  const walletId = subResult.wallet?.walletId;
  const masterAddress = pickFirstAddress(subResult.wallet?.addresses);

  if (!subOrganizationId || !walletId) {
    throw new Error("createSubOrganization did not return wallet metadata");
  }

  const subOrgClient = createSubOrgTurnkeyClient(credentials, subOrganizationId);
  const threadAddress = await deriveThreadAccount({
    client: subOrgClient,
    walletId,
    threadPath,
  });

  return {
    subOrganizationId,
    rootUserIds: subResult.rootUserIds ?? [],
    walletId,
    masterAddress,
    threadAddress,
    threadPath,
  };
}

export async function loadExistingUserWallet(
  subOrganizationId: string,
): Promise<UserWalletProvision> {
  const credentials = loadTurnkeyCredentials();
  const parentClient = createParentTurnkeyClient(credentials);
  const threadPath = threadAccountPath(7);

  const wallets = await parentClient.getWallets({ organizationId: subOrganizationId });
  const walletList = (wallets as { wallets?: { walletId: string }[] }).wallets;
  const walletId = walletList?.[0]?.walletId;
  if (!walletId) {
    throw new Error(`No wallet found in sub-org ${subOrganizationId}`);
  }

  const accounts = await parentClient.getWalletAccounts({
    organizationId: subOrganizationId,
    walletId,
  });
  const accountList = (accounts as { accounts?: { address: string; path: string }[] })
    .accounts;
  const master = accountList?.find((a) => a.path === "m/44'/60'/0'/0/0");
  const existingThread = accountList?.find((a) => a.path === threadPath);

  const masterAddress =
    master?.address ?? pickFirstAddress(accountList?.map((a) => a.address));
  const threadAddress = existingThread?.address ?? masterAddress;

  if (!existingThread?.address) {
    console.warn(
      `[resume] Thread path ${threadPath} not present; using master address for demo signing.`,
    );
  }

  return {
    subOrganizationId,
    rootUserIds: [],
    walletId,
    masterAddress,
    threadAddress,
    threadPath,
  };
}

async function deriveThreadAccount(input: {
  client: ReturnType<typeof createSubOrgTurnkeyClient>;
  walletId: string;
  threadPath: string;
}): Promise<string> {
  const deriveThread = await input.client.createWalletAccounts({
    walletId: input.walletId,
    accounts: [
      {
        curve: "CURVE_SECP256K1",
        pathFormat: "PATH_FORMAT_BIP32",
        path: input.threadPath,
        addressFormat: "ADDRESS_FORMAT_ETHEREUM",
      },
    ],
    persist: true,
  });

  const threadResult = unwrapActivityResult<{ addresses?: string[] }>(
    deriveThread,
    "createWalletAccountsResult",
  );

  return pickFirstAddress(threadResult.addresses);
}

export async function signPlatformBindingAndIdentify(input: {
  subOrganizationId: string;
  signWithAddress: string;
  userRef: string;
  threadId: string;
  walletId: string;
  threadPath: string;
  masterAddress: string;
  threadAddress: string;
}): Promise<SignAndIdentifyResult> {
  const credentials = loadTurnkeyCredentials();
  const subOrgClient = createSubOrgTurnkeyClient(credentials, input.subOrganizationId);
  const parentClient = createParentTurnkeyClient(credentials);

  const payload = buildPlatformBindingPayload({
    userRef: input.userRef,
    threadId: input.threadId,
    subOrganizationId: input.subOrganizationId,
    walletId: input.walletId,
    threadPath: input.threadPath,
  });

  const message = encodePlatformMessage(payload);
  const digest = keccak_256(new TextEncoder().encode(message));
  const payloadHex = Buffer.from(digest).toString("hex");

  const signResponse = await subOrgClient.signRawPayload({
    signWith: input.signWithAddress,
    payload: payloadHex,
    encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
    hashFunction: "HASH_FUNCTION_NO_OP",
  });

  const signResult = unwrapActivityResult<{ r?: string; s?: string; v?: string }>(
    signResponse,
    "signRawPayloadResult",
  );

  const activity = (signResponse as { activity?: { id?: string; fingerprint?: string } })
    .activity;
  const intent = (signResponse as {
    activity?: { intent?: { signRawPayloadIntentV2?: { signWith?: string } } };
  }).activity?.intent?.signRawPayloadIntentV2;

  const accountLookup = await parentClient.getWalletAccount({
    organizationId: input.subOrganizationId,
    walletId: input.walletId,
    address: input.signWithAddress,
  });

  const account = (accountLookup as { account?: { path?: string; publicKey?: string } })
    .account;

  if (!signResult.r || !signResult.s || !signResult.v) {
    throw new Error("signRawPayload did not return signature components");
  }

  return {
    activityId: activity?.id ?? "unknown",
    fingerprint: activity?.fingerprint ?? "unknown",
    signWith: intent?.signWith ?? input.signWithAddress,
    signature: { r: signResult.r, s: signResult.s, v: signResult.v },
    inferredUser: {
      subOrganizationId: input.subOrganizationId,
      walletId: input.walletId,
      masterAddress: input.masterAddress,
      threadAddress: input.threadAddress,
      threadPath: account?.path ?? input.threadPath,
      publicKey: account?.publicKey,
    },
    bindingDigest: payloadHex,
  };
}

export function newUserRef(): string {
  return `user-${randomUUID()}`;
}
