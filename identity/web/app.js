// Manual browser demo (vanilla ESM, no bundler). Mirrors WebPasskeyConnector's enroll/unlock/derive
// so a human can confirm WebAuthn + PRF work on their platform. Keep in sync with web-connector.ts.

import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

const RP_ID = location.hostname; // "localhost"
const PRF_SALT = utf8ToBytes("oursay/v1/prf-root");
const out = document.getElementById("out");
const log = (o) => (out.textContent = typeof o === "string" ? o : JSON.stringify(o, null, 2));
const root32 = (ikm, salt, info) => bytesToHex(hkdf(sha256, ikm, utf8ToBytes(salt), utf8ToBytes(info), 32));

let credentialId = null;
const seen = [];

document.getElementById("enroll").onclick = async () => {
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        rp: { id: RP_ID, name: "OurSay" },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "demo@oursay.test", displayName: "Demo" },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
        timeout: 60000,
        extensions: { prf: {} },
      },
    });
    credentialId = new Uint8Array(cred.rawId);
    const isP256 = cred.response.getPublicKeyAlgorithm?.() === -7;
    log({ step: "enroll", isP256, credentialId: bytesToHex(credentialId) });
  } catch (e) {
    log("enroll failed: " + e.message);
  }
};

async function unlock(label) {
  if (!credentialId) return log("enroll first");
  const assertion = await navigator.credentials.get({
    publicKey: {
      rpId: RP_ID,
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: "public-key", id: credentialId }],
      userVerification: "preferred",
      timeout: 60000,
      extensions: { prf: { eval: { first: PRF_SALT } } },
    },
  });
  const prfBuf = assertion.getClientExtensionResults()?.prf?.results?.first;
  if (!prfBuf) return log("PRF unavailable on this device — production would use the secure-storage fallback");
  const prf = new Uint8Array(prfBuf);
  seen.push(bytesToHex(prf));
  log({
    step: label,
    prfRoot: bytesToHex(prf),
    deviceRoot: root32(prf, "oursay/web/device-root", "demo-device"),
    levelMaster_federal: root32(prf, "oursay/web/level-master", "federal"),
    nullifierRoot_federal: root32(prf, "oursay/web/nullifier-root", "federal"),
    deterministic: seen.length > 1 ? seen[0] === seen[seen.length - 1] : "(unlock again to check)",
  });
}

document.getElementById("unlock").onclick = () => unlock("unlock").catch((e) => log("unlock failed: " + e.message));
document.getElementById("again").onclick = () => unlock("unlock-again").catch((e) => log("unlock failed: " + e.message));
