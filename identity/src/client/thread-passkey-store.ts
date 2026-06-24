// ThreadPasskeyStore — the browser-local index of per-(user, thread) WebAuthn civic credentials
// (Option A, docs/08 §5.4). For each thread the user joins, the WebPasskeyConnector creates one
// passkey credential and records its credential id + PUBLIC key here, keyed by (userId, threadId).
// On each civic append the connector looks the credential up to drive `navigator.credentials.get`
// with `allowCredentials` pinned to it — so the user never sees a key picker.
//
// This is a browser-local HANDLE, not a secret: the credential id is public and the private key never
// leaves the authenticator. Backed by localStorage; a custom backend can be injected for tests.

export interface ThreadCredentialRecord {
  /** The WebAuthn credential id (rawId) as hex — pins `allowCredentials` on assertion. */
  credentialIdHex: string;
  /** The credential's compressed SEC1 P-256 public key (hex) — the envelope author. */
  authorPubkey: string;
}

/** Minimal key/value backend (localStorage in the browser; a Map in tests). */
export interface ThreadStoreBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class ThreadPasskeyStore {
  private readonly backend: ThreadStoreBackend;
  constructor(
    private readonly ns = "oursay/thread-passkey",
    backend?: ThreadStoreBackend,
  ) {
    const b = backend ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    if (!b) throw new Error("ThreadPasskeyStore requires localStorage or an injected backend");
    this.backend = b;
  }

  private key(userId: string, threadId: string): string {
    return `${this.ns}/${userId}/${threadId}`;
  }

  get(userId: string, threadId: string): ThreadCredentialRecord | null {
    const raw = this.backend.getItem(this.key(userId, threadId));
    return raw ? (JSON.parse(raw) as ThreadCredentialRecord) : null;
  }

  set(userId: string, threadId: string, rec: ThreadCredentialRecord): void {
    this.backend.setItem(this.key(userId, threadId), JSON.stringify(rec));
  }
}
