// @oursay/identity/client — passkey custody + client-side signing. Import this from the browser/app.

export type { PasskeyConnector, DeviceCredential, UnlockedSession } from "./connector";
export { DevPasskeyConnector, defaultDevDir } from "./dev-connector";
export type { DevPasskeyOptions } from "./dev-connector";
export { WebPasskeyConnector, OURSAY_PRF_SALT } from "./web-connector";
export type { WebPasskeyOptions } from "./web-connector";
export {
  saveCustodyBinding,
  loadCustodyBinding,
  clearCustodyBinding,
  custodyBindingStorageKey,
  savePrfRootSession,
  loadPrfRootSession,
  clearPrfRootSession,
} from "./custody-binding";
export type { CustodyBinding, CustodyUnlockSource } from "./custody-binding";
export { ThreadPasskeyStore } from "./thread-passkey-store";
export type { ThreadCredentialRecord, ThreadStoreBackend } from "./thread-passkey-store";
export { WebCryptoMasterStore, IndexedDbKeyStore, MemoryKeyStore } from "./secure-store";
export type { SecureMasterStore, KeyStore, WrappedMaster } from "./secure-store";
export { IdentitySession } from "./session";
export { CivicHttpClient, CivicHttpError } from "./civic-http-client";
export type { CivicHttpClientOptions, SubmitRef, CivicDeviceView } from "./civic-http-client";

// Shared DTOs convenient for client callers.
export type {
  ThreadRef,
  ParentRef,
  Intent,
  CreateIntent,
  MutateIntent,
  PreparedAppend,
  SignedSubmission,
  SignMode,
  DeviceEnrollment,
  ThreadRegistration,
  JoinThreadResponse,
} from "../shared/types";
