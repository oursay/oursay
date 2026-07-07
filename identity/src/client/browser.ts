// @oursay/identity/client/browser — the browser-safe client surface. Identical to ./client EXCEPT it
// omits DevPasskeyConnector, which is Node-only (it uses node:fs for dev custody) and cannot bundle for
// the browser. Bundle THIS entry for a browser app (the @oursay/api /walk harness serves it as
// /walk/identity.js). Everything here imports only @noble + DOM APIs + public-record's pure-crypto
// subpaths, so it carries no node:* or server (pg/dotenv) dependency.

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
export type { PasskeyConnector, DeviceCredential, UnlockedSession } from "./connector";

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
  JoinThreadResponse,
} from "../shared/types";
