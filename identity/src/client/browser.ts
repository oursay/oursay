// @oursay/identity/client/browser — the browser-safe client surface. Identical to ./client EXCEPT it
// omits DevPasskeyConnector, which is Node-only (it uses node:fs for dev custody) and cannot bundle for
// the browser. Bundle THIS entry for a browser app (the @oursay/api /walk harness serves it as
// /walk/identity.js). Everything here imports only @noble + DOM APIs + public-record's pure-crypto
// subpaths, so it carries no node:* or server (pg/dotenv) dependency.

export { WebPasskeyConnector } from "./web-connector.js";
export type { WebPasskeyOptions } from "./web-connector.js";
export { ThreadPasskeyStore } from "./thread-passkey-store.js";
export type { ThreadCredentialRecord, ThreadStoreBackend } from "./thread-passkey-store.js";
export { WebCryptoMasterStore, IndexedDbKeyStore, MemoryKeyStore } from "./secure-store.js";
export type { SecureMasterStore, KeyStore, WrappedMaster } from "./secure-store.js";
export { IdentitySession } from "./session.js";
export { CivicHttpClient, CivicHttpError } from "./civic-http-client.js";
export type { CivicHttpClientOptions, SubmitRef, CivicDeviceView } from "./civic-http-client.js";
export type { PasskeyConnector, DeviceCredential, UnlockedSession } from "./connector.js";

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
