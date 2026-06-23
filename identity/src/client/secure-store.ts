// Secure-storage fallback for the WebPasskeyConnector (docs/08 §6 "non-exportable generateKey"; passkey
// FINDINGS §3). When WebAuthn PRF is unavailable, derivation material must still come from somewhere
// without weakening the custody model. This module yields a stable 32-byte master (the HKDF IKM) that:
//
//   - is generated on-device (random), never received from the platform;
//   - is persisted ONLY as ciphertext, encrypted under a NON-EXTRACTABLE AES-GCM wrapping key that
//     itself lives in IndexedDB and can never be read back as bytes; and
//   - only ever materializes in memory (during unwrap), never on the wire.
//
// The downstream HKDF→P-256 derivation (see web-connector.ts `root32`) is IDENTICAL whether the IKM
// came from PRF or from here — only the SOURCE differs (FINDINGS §3). The trade-off vs PRF: PRF keeps
// the master inside the authenticator (never extractable), whereas this fallback materializes it in
// app memory and shifts custody to the (non-extractable, device-bound) wrapping key. Cross-device sync
// would require an encrypted export under a user-held secret — design-only, not built here.
//
// Crypto is Web Crypto (`globalThis.crypto.subtle`), which exists in both browsers and Node 22, so the
// wrap/unwrap is unit-testable in Node with an in-memory KeyStore. Only IndexedDbKeyStore is
// browser-only. This module imports no public-record code, keeping the browser bundle lean.

/** Yields a stable 32-byte derivation master for `name`, creating + persisting it on first use. */
export interface SecureMasterStore {
  getOrCreate(name: string): Promise<Uint8Array>;
}

/** A persisted master: ciphertext + IV, sealed under a non-extractable AES-GCM `wrappingKey`. */
export interface WrappedMaster {
  /** Non-extractable AES-GCM key; opaque handle, never exported as bytes. */
  wrappingKey: CryptoKey;
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

/** Persistence seam: IndexedDbKeyStore (browser) or MemoryKeyStore (tests). */
export interface KeyStore {
  get(id: string): Promise<WrappedMaster | undefined>;
  put(id: string, value: WrappedMaster): Promise<void>;
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("secure-store requires Web Crypto (globalThis.crypto.subtle)");
  return c.subtle;
}

/**
 * The default fallback master store: a random 32-byte master sealed with AES-GCM under a
 * non-extractable wrapping key, persisted via the injected KeyStore.
 */
export class WebCryptoMasterStore implements SecureMasterStore {
  constructor(private readonly store: KeyStore) {}

  async getOrCreate(name: string): Promise<Uint8Array> {
    const existing = await this.store.get(name);
    if (existing) return unwrap(existing);
    const master = globalThis.crypto.getRandomValues(new Uint8Array(32));
    await this.store.put(name, await wrap(master));
    return master;
  }
}

async function wrap(master: Uint8Array): Promise<WrappedMaster> {
  // extractable=false: the wrapping key can encrypt/decrypt but can never be read out as bytes.
  const wrappingKey = await subtle().generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource }, wrappingKey, master as BufferSource);
  return { wrappingKey, iv, ciphertext: new Uint8Array(ct) };
}

async function unwrap(w: WrappedMaster): Promise<Uint8Array> {
  const pt = await subtle().decrypt({ name: "AES-GCM", iv: w.iv as BufferSource }, w.wrappingKey, w.ciphertext as BufferSource);
  return new Uint8Array(pt);
}

/** In-memory KeyStore for tests (and ephemeral sessions). Not persisted. */
export class MemoryKeyStore implements KeyStore {
  private readonly map = new Map<string, WrappedMaster>();
  async get(id: string): Promise<WrappedMaster | undefined> {
    return this.map.get(id);
  }
  async put(id: string, value: WrappedMaster): Promise<void> {
    this.map.set(id, value);
  }
}

/**
 * Browser KeyStore backed by IndexedDB. CryptoKey is structured-cloneable, so the non-extractable
 * wrapping key persists as an opaque handle (still unreadable as bytes) alongside the ciphertext.
 */
export class IndexedDbKeyStore implements KeyStore {
  constructor(
    private readonly dbName = "oursay-secure-store",
    private readonly storeName = "masters",
  ) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(this.storeName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async get(id: string): Promise<WrappedMaster | undefined> {
    const db = await this.open();
    try {
      return await new Promise<WrappedMaster | undefined>((resolve, reject) => {
        const req = db.transaction(this.storeName, "readonly").objectStore(this.storeName).get(id);
        req.onsuccess = () => resolve(req.result as WrappedMaster | undefined);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async put(id: string, value: WrappedMaster): Promise<void> {
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readwrite");
        tx.objectStore(this.storeName).put(value, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
}
