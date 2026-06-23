// Vanilla ESM walk harness — a THIN client over the v1 API. No business logic here; every step is a
// same-origin fetch (credentials: include, so the HttpOnly session cookie authenticates) plus the
// WebAuthn ceremonies via the vendored global `SimpleWebAuthnBrowser`. Dev-only; served from /walk.

const { startRegistration, startAuthentication } = window.SimpleWebAuthnBrowser;

const $ = (id) => document.getElementById(id);
const state = { profile: null, email: null, token: null, scope: null, userId: null };

document.getElementById("origin").textContent = window.location.origin;

function badge(id, kind, text) {
  const el = $(`b-${id}`);
  el.className = `badge ${kind}`;
  el.textContent = text;
}

function show(id, value) {
  $(`out-${id}`).textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function renderSession() {
  if (!state.token) {
    $("session").textContent = "No session yet.";
    return;
  }
  $("session").innerHTML =
    `<strong>Session</strong> — scope: <code>${state.scope}</code> · ` +
    `Bearer: <code>${state.token}</code> <span class="muted">(cookie also set; paste this token into /docs → Authorize)</span>`;
}

/** Same-origin fetch. Returns { ok, status, body }. Throws nothing — callers branch on ok. */
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  if (res.status !== 204) {
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

function setSession(session) {
  state.token = session.token;
  state.scope = session.scope;
  renderSession();
}

// ── 1 · Profile ──────────────────────────────────────────────────────────────
$("saveProfile").addEventListener("click", () => {
  const email = $("email").value.trim();
  if (!email) return show("profile", "Enter an email first.");
  state.email = email;
  state.profile = {
    displayName: $("displayName").value.trim(),
    birthdate: $("birthdate").value.trim(),
    address: {
      line1: $("line1").value.trim() || null,
      city: $("city").value.trim() || null,
      region: $("region").value.trim() || null,
      postalCode: $("postalCode").value.trim() || null,
      country: $("country").value.trim() || null,
    },
  };
  badge("profile", "ok", "saved");
  show("profile", { email, profile: state.profile });
  $("requestOtp").disabled = false;
  $("recoverRequest").disabled = false;
});

// ── 2 · Request registration OTP ─────────────────────────────────────────────
$("requestOtp").addEventListener("click", async () => {
  const r = await api("POST", "/v1/auth/otp/request", { email: state.email, purpose: "registration" });
  if (!r.ok) {
    badge("otp", "err", `error ${r.status}`);
    show("otp", r.body ?? `HTTP ${r.status}`);
    return;
  }
  badge("otp", "ok", "sent");
  show("otp", { ...r.body, hint: "Read the code from the API server console, then go to step 3." });
  $("verifyOtp").disabled = false;
});

// ── 3 · Verify OTP + register ────────────────────────────────────────────────
$("verifyOtp").addEventListener("click", async () => {
  const code = $("otpCode").value.trim();
  const r = await api("POST", "/v1/auth/otp/verify", { email: state.email, code, profile: state.profile });
  if (!r.ok) {
    badge("verify", "err", `error ${r.status}`);
    show("verify", r.body ?? `HTTP ${r.status}`);
    return;
  }
  setSession(r.body.session);
  state.userId = r.body.userId;
  badge("verify", "ok", "registered");
  show("verify", { userId: r.body.userId, session: r.body.session, cookie: "oursay_session set (HttpOnly)" });
  $("enroll").disabled = false;
  $("logout").disabled = false;
  enableFullSessionActions();
});

// Civic + passkey-management + cross-device-login actions need a FULL session. Enable after register/login.
function enableFullSessionActions() {
  $("enrollCivic").disabled = false;
  $("civicUnlock").disabled = false;
  $("listCivic").disabled = false;
  $("listPasskeys").disabled = false;
}

// ── 4 · Enroll passkey ───────────────────────────────────────────────────────
$("enroll").addEventListener("click", async () => {
  try {
    const opts = await api("POST", "/v1/auth/passkey/register/options");
    if (!opts.ok) return failEnroll(opts);
    const attResp = await startRegistration({ optionsJSON: opts.body });
    const verify = await api("POST", "/v1/auth/passkey/register/verify", { response: attResp, label: "walk page" });
    if (!verify.ok) return failEnroll(verify);
    badge("enroll", "ok", "enrolled");
    show("enroll", verify.body);
    $("login").disabled = false;
    $("enableLogin").disabled = false; // now has a passkey → may authorize cross-device login
  } catch (e) {
    badge("enroll", "err", "ceremony failed");
    show("enroll", String(e?.message ?? e));
  }
});
function failEnroll(r) {
  badge("enroll", "err", `error ${r.status}`);
  show("enroll", r.body ?? `HTTP ${r.status}`);
}

// ── 5 · Logout ───────────────────────────────────────────────────────────────
$("logout").addEventListener("click", async () => {
  const r = await api("POST", "/v1/auth/logout");
  if (!r.ok) {
    badge("logout", "err", `error ${r.status}`);
    show("logout", r.body ?? `HTTP ${r.status}`);
    return;
  }
  state.token = null;
  state.scope = null;
  renderSession();
  badge("logout", "ok", "logged out");
  show("logout", "Session revoked (204). Cookie cleared. Use step 6 to log back in with the passkey.");
});

// ── 6 · Passkey login ────────────────────────────────────────────────────────
$("login").addEventListener("click", async () => {
  try {
    const opts = await api("POST", "/v1/auth/passkey/login/options", {});
    if (!opts.ok) return failLogin(opts);
    const asgResp = await startAuthentication({ optionsJSON: opts.body });
    const verify = await api("POST", "/v1/auth/passkey/login/verify", { response: asgResp });
    if (!verify.ok) return failLogin(verify);
    setSession(verify.body.session);
    state.userId = verify.body.userId;
    badge("login", "ok", "logged in");
    enableFullSessionActions();
    $("enableLogin").disabled = false;
    const me = await api("GET", "/v1/profile");
    show("login", { userId: verify.body.userId, session: verify.body.session, profile: me.ok ? me.body : `profile ${me.status}` });
  } catch (e) {
    badge("login", "err", "ceremony failed");
    show("login", String(e?.message ?? e));
  }
});
function failLogin(r) {
  badge("login", "err", `error ${r.status}`);
  show("login", r.body ?? `HTTP ${r.status}`);
}

// ── 7 · Recovery → re-enroll ─────────────────────────────────────────────────
$("recoverRequest").addEventListener("click", async () => {
  const r = await api("POST", "/v1/auth/otp/request", { email: state.email, purpose: "recovery" });
  badge("recovery", r.ok ? "ok" : "err", r.ok ? "code sent (if account exists)" : `error ${r.status}`);
  show("recovery", r.ok ? { ...r.body, hint: "Read the recovery code from the server console." } : r.body);
  $("recoverVerify").disabled = !r.ok;
});

$("recoverVerify").addEventListener("click", async () => {
  const code = $("recoveryCode").value.trim();
  const r = await api("POST", "/v1/auth/recovery/verify", { email: state.email, code });
  if (!r.ok) {
    badge("recovery", "err", `error ${r.status}`);
    show("recovery", r.body ?? `HTTP ${r.status}`);
    return;
  }
  setSession(r.body.session);
  badge("recovery", "ok", "recovery session");
  show("recovery", { ...r.body, note: "Recovery-scoped session — re-enroll a passkey to regain full access." });
  $("recoverEnroll").disabled = false;
});

$("recoverEnroll").addEventListener("click", async () => {
  try {
    const opts = await api("POST", "/v1/auth/passkey/register/options");
    if (!opts.ok) {
      show("recovery", opts.body ?? `HTTP ${opts.status}`);
      return;
    }
    const attResp = await startRegistration({ optionsJSON: opts.body });
    const verify = await api("POST", "/v1/auth/passkey/register/verify", { response: attResp, label: "recovered device" });
    if (!verify.ok) {
      show("recovery", verify.body ?? `HTTP ${verify.status}`);
      return;
    }
    badge("recovery", "ok", "re-enrolled");
    show("recovery", { ...verify.body, next: "Now log in again via step 7 to get a full session." });
    $("login").disabled = false;
  } catch (e) {
    badge("recovery", "err", "ceremony failed");
    show("recovery", String(e?.message ?? e));
  }
});

// ── 4b · Manage passkeys (list / revoke a device) ────────────────────────────
$("listPasskeys").addEventListener("click", renderPasskeys);

async function renderPasskeys() {
  const r = await api("GET", "/v1/auth/passkeys");
  $("passkeyList").innerHTML = "";
  if (!r.ok) {
    badge("manage", "err", `error ${r.status}`);
    show("manage", r.body ?? `HTTP ${r.status}`);
    return;
  }
  badge("manage", "ok", `${r.body.passkeys.length} passkey(s)`);
  show("manage", r.body);
  for (const pk of r.body.passkeys) {
    const btn = document.createElement("button");
    btn.textContent = `Revoke ${pk.label ?? pk.id.slice(0, 8)}`;
    btn.addEventListener("click", async () => {
      const rev = await api("POST", "/v1/auth/passkey/revoke", { id: pk.id });
      if (!rev.ok) {
        // e.g. 403 when it's the last passkey — surfaced verbatim.
        badge("manage", "err", `revoke ${rev.status}`);
        show("manage", rev.body ?? `HTTP ${rev.status}`);
        return;
      }
      await renderPasskeys();
    });
    $("passkeyList").appendChild(btn);
  }
}

// ── 5 · Civic device key + golden path (real @oursay/identity SDK) ────────────
// Drives the PRODUCTION civic custody + write path in the browser via the bundled SDK
// (/walk/identity.js): a passkey-unlocked, non-exportable derivation root (or, when PRF is
// unavailable, a non-extractable AES-wrapped fallback master in IndexedDB) → device-signed envelope.
// The platform only ever receives PUBLIC keys, an opaque commitment, and the signed envelope.
//
// NOTE: this civic-custody passkey is SEPARATE from the step-4 account-login passkey — you will see a
// second passkey prompt. The SDK is dynamically imported on click so steps 1–4 still work if the
// dev-only bundle fails to build.

const CIVIC_JURISDICTION = "ab-ca-gov";

/** Best-effort: recover state.userId from the live session if it wasn't captured at register/login. */
async function ensureUserId() {
  if (state.userId) return state.userId;
  const me = await api("GET", "/v1/auth/session");
  if (me.ok && me.body?.userId) state.userId = me.body.userId;
  return state.userId;
}

// The browser SDK bundle (/walk/identity.js) is dynamically imported on first civic action and cached
// for the page, so steps 1–4 still work if the dev-only bundle fails to build.
let identityMod = null;
async function loadIdentity() {
  if (!identityMod) identityMod = await import("/walk/identity.js");
  return identityMod;
}

/**
 * Establish (or re-establish) a civic signing session: enroll a civic-custody credential, unlock it
 * once via WebAuthn, and build a CivicHttpClient with the civic device enrolled. Shared by the
 * one-click golden path and sub-step 5a. Thread handling is explicit: an existing thread is REUSED
 * (re-running 5a never mints a new thread), and postId/commentId carry over; but `joined` resets to
 * false because the freshly built client starts with an empty join set (5b — or 5c–5e's append — will
 * re-join). Returns the stashed state.civic.
 */
async function establishCivic(userId) {
  const { WebPasskeyConnector, IdentitySession, CivicHttpClient } = await loadIdentity();
  const conn = new WebPasskeyConnector();
  const cred = await conn.enrollDevice({ userId, label: "walk civic device" });
  const session = new IdentitySession(await conn.unlock({ userId, deviceId: cred.deviceId }));
  const client = new CivicHttpClient({ baseUrl: location.origin, session, credentials: "include" });
  await client.ensureDeviceEnrolled("walk civic device");
  const thread = state.civic?.thread ?? { threadId: crypto.randomUUID(), jurisdiction: CIVIC_JURISDICTION };
  state.civic = {
    conn, cred, session, client, thread,
    source: conn.lastUnlockSource, // "prf" or "secure-store" (fallback)
    devicePubkey: session.devicePubkey,
    joined: false,
    postId: state.civic?.postId ?? null,
    commentId: state.civic?.commentId ?? null,
  };
  return state.civic;
}

/** Gate the 5b–5e sub-step buttons from civic state. listCivic is NOT gated here (full-session only). */
function refreshCivicButtons() {
  const c = state.civic;
  $("civicJoin").disabled = !c;
  $("civicPost").disabled = !c || !c.joined || !!c.postId;
  $("civicComment").disabled = !c || !c.postId;
  $("civicReact").disabled = !c || !c.postId;
}

$("enrollCivic").addEventListener("click", async () => {
  const userId = await ensureUserId();
  if (!userId) {
    badge("civic", "err", "no session");
    return show("civic", "Register or log in first — the civic flow needs your userId.");
  }
  try {
    badge("civic", "", "loading SDK…");
    // One smoke test: enroll a civic-custody credential, unlock it, then one SDK call ensures device
    // enrolled → joins the thread (ownership-only, no kycTier) → prepare → DEVICE-sign → submit.
    const civic = await establishCivic(userId);
    const ref = await civic.client.createPost(civic.thread, { body: "hello from the walk" });
    civic.joined = true;
    civic.postId = civic.thread.threadId;
    badge("civic", "ok", `posted (${civic.source})`);
    show("civic", {
      custodySource: civic.source,
      devicePubkey: civic.devicePubkey,
      thread: civic.thread,
      ref,
      note: "Real SDK: passkey-unlocked custody, device-signed envelope. Platform received only public keys + the signed envelope. You can continue with sub-steps 5d/5e on this post.",
    });
    $("listCivic").disabled = false;
    refreshCivicButtons();
  } catch (e) {
    badge("civic", "err", "civic flow failed");
    show("civic", String(e?.message ?? e));
  }
});

// ── 5a–5e · Civic sub-steps (unlock once, sign many) ──────────────────────────
// 5a unlocks custody (may prompt WebAuthn); 5b–5e act on the stored, already-unlocked
// CivicHttpClient + IdentitySession with NO further prompt.

$("civicUnlock").addEventListener("click", async () => {
  const userId = await ensureUserId();
  if (!userId) {
    badge("civicsub", "err", "no session");
    return show("civicsub", "Register or log in first — the civic flow needs your userId.");
  }
  try {
    badge("civicsub", "", "loading SDK…");
    const civic = await establishCivic(userId);
    badge("civicsub", "ok", `unlocked (${civic.source})`);
    show("civicsub", {
      step: "5a · unlock civic custody",
      custodySource: civic.source,
      devicePubkey: civic.devicePubkey,
      deviceId: civic.cred.deviceId,
      thread: civic.thread,
      note: "Civic device enrolled and session unlocked ONCE. 5b–5e reuse this session with no further WebAuthn prompt.",
    });
    refreshCivicButtons();
  } catch (e) {
    badge("civicsub", "err", "unlock failed");
    show("civicsub", String(e?.message ?? e));
  }
});

$("civicJoin").addEventListener("click", async () => {
  const c = state.civic;
  if (!c) return;
  try {
    await c.client.ensureJoined(c.thread);
    c.joined = true;
    badge("civicsub", "ok", "joined");
    show("civicsub", { step: "5b · join thread", thread: c.thread, note: "Ownership-only join — no kycTier." });
    refreshCivicButtons();
  } catch (e) {
    badge("civicsub", "err", "join failed");
    show("civicsub", String(e?.message ?? e));
  }
});

$("civicPost").addEventListener("click", async () => {
  const c = state.civic;
  if (!c) return;
  try {
    const ref = await c.client.createPost(c.thread, { body: "root post from walk sub-steps" });
    c.postId = c.thread.threadId;
    badge("civicsub", "ok", "post created");
    show("civicsub", { step: "5c · create root post", ref });
    refreshCivicButtons();
  } catch (e) {
    badge("civicsub", "err", "post failed");
    show("civicsub", String(e?.message ?? e));
  }
});

$("civicComment").addEventListener("click", async () => {
  const c = state.civic;
  if (!c || !c.postId) return;
  try {
    const parent = { type: "post", id: c.postId };
    const ref = await c.client.createComment(c.thread, parent, { body: "a reply from walk sub-steps" });
    c.commentId = ref.entityId;
    badge("civicsub", "ok", "comment added");
    show("civicsub", { step: "5d · add comment", parent, ref });
    refreshCivicButtons();
  } catch (e) {
    badge("civicsub", "err", "comment failed");
    show("civicsub", String(e?.message ?? e));
  }
});

$("civicReact").addEventListener("click", async () => {
  const c = state.civic;
  if (!c || !c.postId) return;
  try {
    const parent = c.commentId ? { type: "comment", id: c.commentId } : { type: "post", id: c.postId };
    const ref = await c.client.addReaction(c.thread, parent, { kind: "check" });
    badge("civicsub", "ok", "reaction added");
    show("civicsub", { step: "5e · add reaction", parent, kind: "check", ref });
    refreshCivicButtons();
  } catch (e) {
    badge("civicsub", "err", "reaction failed");
    show("civicsub", String(e?.message ?? e));
  }
});

$("listCivic").addEventListener("click", async () => {
  const r = await api("GET", "/v1/civic/devices");
  badge("civic", r.ok ? "ok" : "err", r.ok ? "listed" : `error ${r.status}`);
  show("civic", r.body ?? `HTTP ${r.status}`);
});

// ── 8 · Sign in on another device (gated login OTP) ──────────────────────────
$("enableLogin").addEventListener("click", async () => {
  // From the trusted device (full session + passkey) → opens the login window + emails the code.
  const r = await api("POST", "/v1/auth/login/enable");
  if (!r.ok) {
    badge("loginflow", "err", `error ${r.status}`);
    show("loginflow", r.body ?? `HTTP ${r.status}`);
    return;
  }
  badge("loginflow", "ok", "login enabled");
  show("loginflow", { ...r.body, hint: "Read the login code from the server console, then verify below as the 'new device'." });
  $("verifyLoginOtp").disabled = false;
});

$("verifyLoginOtp").addEventListener("click", async () => {
  // Simulated new device: redeem the code → limited 'login' (enroll-only) session.
  const code = $("loginCode").value.trim();
  const r = await api("POST", "/v1/auth/login/verify", { email: state.email, code });
  if (!r.ok) {
    badge("loginflow", "err", `error ${r.status}`);
    show("loginflow", r.body ?? `HTTP ${r.status}`);
    return;
  }
  setSession(r.body.session);
  if (r.body.userId) state.userId = r.body.userId;
  // Prove the scope is enroll-only: a full-scope read must be rejected until a passkey is enrolled.
  const me = await api("GET", "/v1/profile");
  badge("loginflow", "ok", "login session (enroll-only)");
  show("loginflow", {
    ...r.body,
    profileReadStatus: me.status,
    note: "scope 'login' is enroll-only — /v1/profile is 403 until a passkey is enrolled on this device.",
  });
  $("enrollLoginPasskey").disabled = false;
});

$("enrollLoginPasskey").addEventListener("click", async () => {
  try {
    const opts = await api("POST", "/v1/auth/passkey/register/options");
    if (!opts.ok) return failLoginFlow(opts);
    const attResp = await startRegistration({ optionsJSON: opts.body });
    const verify = await api("POST", "/v1/auth/passkey/register/verify", { response: attResp, label: "second device" });
    if (!verify.ok) return failLoginFlow(verify);
    badge("loginflow", "ok", "passkey enrolled on new device");
    show("loginflow", { ...verify.body, next: "Now log in with this passkey (step 7) for a full session." });
    $("login").disabled = false;
  } catch (e) {
    badge("loginflow", "err", "ceremony failed");
    show("loginflow", String(e?.message ?? e));
  }
});
function failLoginFlow(r) {
  badge("loginflow", "err", `error ${r.status}`);
  show("loginflow", r.body ?? `HTTP ${r.status}`);
}
