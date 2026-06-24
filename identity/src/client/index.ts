// @oursay/identity/client — passkey custody + client-side signing. Import this from the browser/app.

export type { PasskeyConnector, DeviceCredential, UnlockedSession } from "./connector.js";
export { DevPasskeyConnector, defaultDevDir } from "./dev-connector.js";
export type { DevPasskeyOptions } from "./dev-connector.js";
export { WebPasskeyConnector } from "./web-connector.js";
export type { WebPasskeyOptions } from "./web-connector.js";
export { ThreadPasskeyStore } from "./thread-passkey-store.js";
export type { ThreadCredentialRecord, ThreadStoreBackend } from "./thread-passkey-store.js";
export { WebCryptoMasterStore, IndexedDbKeyStore, MemoryKeyStore } from "./secure-store.js";
export type { SecureMasterStore, KeyStore, WrappedMaster } from "./secure-store.js";
export { IdentitySession } from "./session.js";
export { CivicHttpClient, CivicHttpError } from "./civic-http-client.js";
export type { CivicHttpClientOptions, SubmitRef, CivicDeviceView } from "./civic-http-client.js";

// Shared DTOs convenient for client callers.
export type {
  ThreadRef,
  ParentRef,
  Intent,
  CreateIntent,
  MutateIntent,
  PreparedAppend,
  SignedSubmission,
  DeviceEnrollment,
  ThreadRegistration,
} from "../shared/types.js";
