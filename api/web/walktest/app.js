// Vanilla ESM walk harness — a THIN client over the v1 API. No business logic here; every step is a
// same-origin fetch (credentials: include, so the HttpOnly session cookie authenticates) plus the
// WebAuthn ceremonies via the vendored global `SimpleWebAuthnBrowser`. Dev-only; served from /walk.

const { startRegistration, startAuthentication } = window.SimpleWebAuthnBrowser;

const $ = (id) => document.getElementById(id);
const state = { profile: null, email: null, token: null, scope: null };

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
  badge("verify", "ok", "registered");
  show("verify", { userId: r.body.userId, session: r.body.session, cookie: "oursay_session set (HttpOnly)" });
  $("enroll").disabled = false;
  $("logout").disabled = false;
});

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
    badge("login", "ok", "logged in");
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
  const r = await api("POST", "/v1/auth/recovery/request", { email: state.email });
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
    show("recovery", { ...verify.body, next: "Now log in again via step 6 to get a full session." });
    $("login").disabled = false;
  } catch (e) {
    badge("recovery", "err", "ceremony failed");
    show("recovery", String(e?.message ?? e));
  }
});
