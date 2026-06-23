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

/** Best-effort: recover state.userId from the live session if it wasn't captured at register/login. */
async function ensureUserId() {
  if (state.userId) return state.userId;
  const me = await api("GET", "/v1/auth/session");
  if (me.ok && me.body?.userId) state.userId = me.body.userId;
  return state.userId;
}

$("enrollCivic").addEventListener("click", async () => {
  const userId = await ensureUserId();
  if (!userId) {
    badge("civic", "err", "no session");
    return show("civic", "Register or log in first — the civic flow needs your userId.");
  }
  try {
    badge("civic", "", "loading SDK…");
    const { WebPasskeyConnector, IdentitySession, CivicHttpClient } = await import("/walk/identity.js");

    // Civic-custody credential (distinct from the account-login passkey) → unlock a signing session.
    const conn = new WebPasskeyConnector();
    const cred = await conn.enrollDevice({ userId, label: "walk civic device" });
    const session = new IdentitySession(await conn.unlock({ userId, deviceId: cred.deviceId }));

    // One SDK call: ensure civic device enrolled → join thread (ownership-only, no kycTier) →
    // prepare → DEVICE-sign → submit into the verified record pool.
    const client = new CivicHttpClient({ baseUrl: location.origin, session, credentials: "include" });
    const thread = { threadId: crypto.randomUUID(), jurisdiction: "ab-ca-gov" };
    const ref = await client.createPost(thread, { body: "hello from the walk" });

    state.civic = { conn, client, thread, deviceId: cred.deviceId };
    badge("civic", "ok", `posted (${conn.lastUnlockSource})`);
    show("civic", {
      custodySource: conn.lastUnlockSource, // "prf" or "secure-store" (fallback)
      devicePubkey: session.devicePubkey,
      thread,
      ref,
      note: "Real SDK: passkey-unlocked custody, device-signed envelope. Platform received only public keys + the signed envelope.",
    });
    $("listCivic").disabled = false;
  } catch (e) {
    badge("civic", "err", "civic flow failed");
    show("civic", String(e?.message ?? e));
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
