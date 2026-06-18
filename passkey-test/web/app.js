// Vanilla ESM — no imports, no bundler. Exercises WebAuthn registration/auth (P-256) and the PRF
// extension. The PRF output (when available) is the 32-byte IKM that the Node/mocha vectors turn
// into per-thread keys (HKDF → P-256). Node + @noble is the deterministic source of truth; this
// page proves the browser path and captures real browser/OS PRF support.

const RP_ID = "localhost";
const out = document.getElementById("out");
const matrix = document.getElementById("matrix");
const btnReg = document.getElementById("register");
const btnAuth = document.getElementById("authenticate");
const btnAuth2 = document.getElementById("authenticate2");
const btnCopy = document.getElementById("copy");
const copied = document.getElementById("copied");

// Fixed PRF salt = a per-level label. In the real adapter this is the level master's PRF input;
// the same salt + same passkey must yield the same 32 bytes (that determinism is the whole point).
const PRF_SALT = new TextEncoder().encode("oursay/v1/level/federal");

let credentialId = null; // Uint8Array rawId from registration
const state = { prfEnabledAtCreate: null, prfFirst: null, prfFirstAgain: null };

const bufToHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const log = (obj) => { out.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2); };

function renderMatrix() {
  try {
    const ua = navigator.userAgent;
    const plat = navigator.userAgentData?.platform ?? navigator.platform ?? "unknown";
    const prfOut = state.prfFirst ? "yes" : "no";
    const deterministic =
      state.prfFirst && state.prfFirstAgain
        ? state.prfFirst === state.prfFirstAgain ? "yes" : "NO(!)"
        : "n/a";
    const enabled = state.prfEnabledAtCreate === null ? "n/a" : String(state.prfEnabledAtCreate);
    matrix.textContent =
      `| Browser/UA | OS | Authenticator | prf.enabled@create | prf output@get | deterministic |\n` +
      `|---|---|---|---|---|---|\n` +
      `| ${ua} | ${plat} | platform | ${enabled} | ${prfOut} | ${deterministic} |`;
  } catch (e) {
    matrix.textContent = "matrix render error: " + (e?.message ?? String(e));
  }
}

async function register() {
  try {
    if (!window.PublicKeyCredential) return log("WebAuthn not available in this browser.");
    const cred = await navigator.credentials.create({
      publicKey: {
        rp: { id: RP_ID, name: "OurSay passkey-test" },
        user: { id: rand(16), name: "alice@oursay.test", displayName: "Alice (test)" },
        challenge: rand(32),
        // ES256/P-256 FIRST (our canonical, passkey-native curve). RS256 second only to satisfy
        // Chrome's compatibility lint; any platform authenticator that supports ES256 picks it
        // because it is listed first. We then VERIFY the credential actually used P-256 below.
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256 / P-256 (required)
          { type: "public-key", alg: -257 }, // RS256 (fallback — silences Chrome lint)
        ],
        authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
        timeout: 60000,
        extensions: { prf: {} }, // ask whether PRF is available for this credential
      },
    });
    credentialId = new Uint8Array(cred.rawId);
    const ext = cred.getClientExtensionResults?.() ?? {};
    state.prfEnabledAtCreate = ext.prf?.enabled ?? false;
    const coseAlg = cred.response.getPublicKeyAlgorithm?.(); // -7 = ES256/P-256, -257 = RS256
    btnAuth.disabled = false;
    log({
      step: "register",
      credentialIdHex: bufToHex(cred.rawId),
      coseAlg: coseAlg ?? "unknown",
      isP256: coseAlg === -7, // OurSay requires this; production rejects anything else
      type: cred.type,
      authenticatorAttachment: cred.authenticatorAttachment ?? "unknown",
      prfEnabledAtCreate: state.prfEnabledAtCreate,
    });
  } catch (e) {
    log("register failed: " + (e?.message ?? String(e)));
  } finally {
    renderMatrix();
  }
}

async function authenticate(slot) {
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        rpId: RP_ID,
        challenge: rand(32),
        allowCredentials: credentialId ? [{ type: "public-key", id: credentialId }] : [],
        userVerification: "preferred",
        timeout: 60000,
        extensions: { prf: { eval: { first: PRF_SALT } } },
      },
    });
    const ext = assertion.getClientExtensionResults?.() ?? {};
    const first = ext.prf?.results?.first ? bufToHex(ext.prf.results.first) : null;
    state[slot] = first;
    if (slot === "prfFirst") btnAuth2.disabled = false;
    log({
      step: slot === "prfFirst" ? "authenticate" : "authenticate-again",
      prfSupported: !!first,
      prfOutputHex: first ?? "(none — PRF unsupported on this browser/authenticator)",
      note: "this 32-byte value is the HKDF IKM the Node vectors derive per-thread keys from",
    });
  } catch (e) {
    log("authenticate failed: " + (e?.message ?? String(e)));
  } finally {
    renderMatrix();
  }
}

btnReg.addEventListener("click", register);
btnAuth.addEventListener("click", () => authenticate("prfFirst"));
btnAuth2.addEventListener("click", () => authenticate("prfFirstAgain"));

btnCopy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(matrix.textContent);
    copied.textContent = "copied ✓";
  } catch {
    // Clipboard API may be blocked; fall back to selecting the text for a manual copy.
    const range = document.createRange();
    range.selectNodeContents(matrix);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    copied.textContent = "selected — press Ctrl+C";
  }
  setTimeout(() => (copied.textContent = ""), 2500);
});

// Render an initial row immediately so the element is never stuck on the placeholder.
renderMatrix();
