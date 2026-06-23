// Secure-storage fallback (docs/08 §6; FINDINGS §3) — the PRF-unavailable custody path. These are
// pure-JS units: Web Crypto (globalThis.crypto.subtle) exists in Node 22, so the wrap/unwrap is
// exercised here with an in-memory KeyStore (no browser, no IndexedDB, no DB). The browser-only pieces
// (WebAuthn PRF + IndexedDbKeyStore) are covered by the /walk manual QA, not here.
//
// The end-to-end case proves the load-bearing property: a fallback master, HKDF-expanded exactly as
// WebPasskeyConnector does, drives IdentitySession.buildSigned into an envelope that verifies — so the
// fallback is a real signing custody path, not just storage.

import { expect } from "chai";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { p256 } from "@noble/curves/p256";
import { bytesToNumberBE, numberToBytesBE } from "@noble/curves/abstract/utils";
import { verifyEnvelope } from "@oursay/public-record/identity/envelope";
import { WebCryptoMasterStore, MemoryKeyStore, IdentitySession } from "@oursay/identity/client";
import type { UnlockedSession } from "@oursay/identity/client";
import type { Intent, PreparedAppend, ThreadRef } from "@oursay/identity";

// Mirror of WebPasskeyConnector's IKM expansion (only the source of the 32-byte IKM differs, FINDINGS §3).
const root32 = (ikm: Uint8Array, salt: string, info: string) => hkdf(sha256, ikm, utf8ToBytes(salt), utf8ToBytes(info), 32);
function p256PrivFrom(ikm: Uint8Array, info: string): Uint8Array {
  const okm = hkdf(sha256, ikm, utf8ToBytes("oursay/dev/p256"), utf8ToBytes(info), 48);
  const n = p256.CURVE.n;
  return numberToBytesBE((bytesToNumberBE(okm) % (n - 1n)) + 1n, 32);
}

/** Build the same UnlockedSession shape the web connector derives from a (here: fallback) master. */
function sessionFromMaster(master: Uint8Array, userId: string, deviceId: string): UnlockedSession {
  const deviceRoot = root32(master, "oursay/web/device-root", deviceId);
  const devicePubkey = bytesToHex(p256.getPublicKey(p256PrivFrom(deviceRoot, `account|${userId}`)));
  return {
    userId,
    deviceId,
    devicePubkey,
    deviceRoot,
    jurisdictionMaster: (j: string) => root32(master, "oursay/web/jurisdiction-master", j),
    nullifierRoot: (j: string) => root32(master, "oursay/web/nullifier-root", j),
  };
}

describe("03 secure-store: PRF-unavailable fallback master (non-extractable AES wrap)", () => {
  it("returns a stable 32-byte master across calls", async () => {
    const store = new WebCryptoMasterStore(new MemoryKeyStore());
    const a = await store.getOrCreate("user-1");
    const b = await store.getOrCreate("user-1");
    expect(a).to.have.lengthOf(32);
    expect(bytesToHex(b)).to.equal(bytesToHex(a));
  });

  it("persists no plaintext master and a non-extractable wrapping key", async () => {
    const keyStore = new MemoryKeyStore();
    const master = await new WebCryptoMasterStore(keyStore).getOrCreate("user-1");
    const rec = await keyStore.get("user-1");
    expect(rec, "wrapped record present").to.not.equal(undefined);
    expect(rec!.wrappingKey.extractable, "wrapping key non-extractable").to.equal(false);
    // The ciphertext must not contain the plaintext master bytes.
    expect(Buffer.from(rec!.ciphertext).includes(Buffer.from(master)), "no plaintext master in storage").to.equal(false);
  });

  it("derives independent masters per name", async () => {
    const store = new WebCryptoMasterStore(new MemoryKeyStore());
    const u1 = await store.getOrCreate("user-1");
    const u2 = await store.getOrCreate("user-2");
    expect(bytesToHex(u1)).to.not.equal(bytesToHex(u2));
  });

  it("drives a verifiable device-signed envelope (fallback is a real signing custody path)", async () => {
    const master = await new WebCryptoMasterStore(new MemoryKeyStore()).getOrCreate("user-1");
    const session = new IdentitySession(sessionFromMaster(master, "user-1", "device-A"));
    const t: ThreadRef = { threadId: "thread-1", jurisdiction: "ab-ca-gov" };
    const intent: Intent = { op: "create", type: "post", entityId: "thread-1", content: { body: "hi" } };
    const prep: PreparedAppend = { prevHash: null, rootEntityId: "thread-1" };

    const signed = session.buildSigned(t, prep, intent);
    expect(verifyEnvelope(signed.envelope), "envelope verifies").to.equal(true);
    expect(signed.envelope.authorPubkey).to.equal(session.personaPubkey(t));
    expect(signed.envelope.signerPubkey).to.equal(session.signerPubkey(t));
  });
});
