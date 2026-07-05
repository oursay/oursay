// Gated cross-device login (docs/08). Email OTP is not a standing login method: a 'login' code only
// works after a TRUSTED device (full session + passkey) opens the window via /v1/auth/login/enable.
// Completing it on a new device yields a LIMITED 'login'-scoped session (enroll-only) — full access
// comes from the subsequent passkey login. Login does NOT revoke other sessions (it's additive).

import { randomUUID } from "node:crypto";
import { expect } from "chai";
import { webauthnConfig } from "../src/config.js";
import { SoftAuthenticator } from "./fixtures/webauthn/soft-authenticator.js";
import { codeFromLastMail, resetWorld, type World } from "./helpers/world.js";
import { expectServiceError } from "./helpers/expect.js";

const ADULT_DOB = "1990-06-15";
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Register an account (via the OTP service path) and enroll one passkey → returns a trusted device. */
async function registerWithPasskey(
  w: World,
  email: string,
): Promise<{ userId: string; token: string; auth: SoftAuthenticator }> {
  await w.services.otpService.request({ emailRaw: email, purpose: "registration" });
  const code = codeFromLastMail(w.mail, email);
  const reg = await w.services.registrationService.registerWithOtp({
    emailRaw: email,
    code,
    profile: { displayName: "Login Tester", birthdate: ADULT_DOB },
  });
  const auth = new SoftAuthenticator(webauthnConfig.rpID, webauthnConfig.origin);
  const opts = await w.services.passkeyService.registerOptions({
    userId: reg.userId,
    userName: email,
    userDisplayName: "Login Tester",
  });
  await w.services.passkeyService.registerVerify({ userId: reg.userId, response: auth.register(opts.challenge) });
  return { userId: reg.userId, token: reg.session.token, auth };
}

/** A registered account with NO passkey (created directly, like the recovery spec). */
async function makeBarAccount(w: World, email: string): Promise<string> {
  const userId = randomUUID();
  await w.services.repos.user.create({ id: userId, handle: `@u${userId.slice(0, 8)}` });
  await w.services.repos.profile.insert({
    userId, firstName: null, lastName: null,
    line1: null, line2: null, city: null, province: "AB", postalCode: null, country: "CA",
    memo: null, birthdate: ADULT_DOB, email, emailCanonical: email.toLowerCase(),
  });
  return userId;
}

describe("10 gated login: enable window + enroll-only session", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("enable requires an enrolled passkey on the trusted device", async () => {
    const userId = await makeBarAccount(w, "nopk@example.com");
    await expectServiceError(() => w.services.loginService.enable({ userId }), "forbidden");
    expect(w.mail.outbox).to.have.length(0);
  });

  it("rejects /v1/auth/login/enable without a session (401)", async () => {
    const res = await w.app.inject({ method: "POST", url: "/v1/auth/login/enable" });
    expect(res.statusCode).to.equal(401);
  });

  it("does NOT send or verify a login OTP when no window is open (no enumeration)", async () => {
    const email = "gated@example.com";
    await registerWithPasskey(w, email);
    w.mail.clear();

    // Unified request with purpose:login → 202 but nothing sent (window not opened).
    const req = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: { email, purpose: "login" },
    });
    expect(req.statusCode).to.equal(202);
    expect(w.mail.outbox).to.have.length(0);

    // And a bare verify with any code fails.
    const verify = await w.app.inject({
      method: "POST",
      url: "/v1/auth/login/verify",
      payload: { email, code: "123456" },
    });
    expect(verify.statusCode).to.equal(400);
  });

  it("trusted enable → new-device login → enroll-only session → passkey login → full", async () => {
    const email = "crossdevice@example.com";
    const trusted = await registerWithPasskey(w, email);
    w.mail.clear();

    // 1. Trusted device opens the window (full session + passkey) → login OTP emailed.
    const enable = await w.app.inject({ method: "POST", url: "/v1/auth/login/enable", headers: bearer(trusted.token) });
    expect(enable.statusCode).to.equal(202);
    const code = codeFromLastMail(w.mail, email);

    // 2. New device redeems the code → a LIMITED 'login' session.
    const verify = await w.app.inject({ method: "POST", url: "/v1/auth/login/verify", payload: { email, code } });
    expect(verify.statusCode).to.equal(200);
    const body = verify.json() as { status: string; userId: string; session: { token: string; scope: string } };
    expect(body.status).to.equal("passkey_enroll");
    expect(body.userId).to.equal(trusted.userId);
    expect(body.session.scope).to.equal("login");

    // 3. The login session is enroll-only: a full-scope read is rejected.
    const blocked = await w.app.inject({ method: "GET", url: "/v1/profile", headers: bearer(body.session.token) });
    expect(blocked.statusCode).to.equal(403);

    // 4. It MAY enroll a passkey (the whole point). Use a second authenticator (the new device).
    const device2 = new SoftAuthenticator(webauthnConfig.rpID, webauthnConfig.origin);
    const opts = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: bearer(body.session.token),
    });
    expect(opts.statusCode).to.equal(200);
    const enroll = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/verify",
      headers: bearer(body.session.token),
      payload: { response: device2.register((opts.json() as { challenge: string }).challenge) },
    });
    expect(enroll.statusCode).to.equal(201);

    // 5. The new device logs in with its passkey → a FULL session that can read the profile.
    const loginOpts = await w.app.inject({ method: "POST", url: "/v1/auth/passkey/login/options", payload: {} });
    const login = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/login/verify",
      payload: { response: device2.authenticate((loginOpts.json() as { challenge: string }).challenge) },
    });
    expect(login.statusCode).to.equal(200);
    const loginBody = login.json() as { session: { token: string; scope: string } };
    expect(loginBody.session.scope).to.equal("full");
    const me = await w.app.inject({ method: "GET", url: "/v1/profile", headers: bearer(loginBody.session.token) });
    expect(me.statusCode).to.equal(200);
  });

  it("login does NOT revoke other sessions (unlike recovery)", async () => {
    const email = "additive@example.com";
    const trusted = await registerWithPasskey(w, email);

    // Another live full session for the same user (a different existing device).
    const deviceA = await w.services.authService.issue(trusted.userId, "full", "device-a");
    w.mail.clear();

    await w.app.inject({ method: "POST", url: "/v1/auth/login/enable", headers: bearer(trusted.token) });
    const code = codeFromLastMail(w.mail, email);
    const verify = await w.app.inject({ method: "POST", url: "/v1/auth/login/verify", payload: { email, code } });
    expect(verify.statusCode).to.equal(200);

    // Device A's session is still alive — adding a device is additive.
    expect((await w.services.authService.resolve(deviceA.token))?.userId).to.equal(trusted.userId);
    expect((await w.services.authService.resolve(trusted.token))?.userId).to.equal(trusted.userId);
  });

  it("unified /v1/auth/otp/request routes the login purpose through the window gate", async () => {
    const email = "resend@example.com";
    const trusted = await registerWithPasskey(w, email);
    w.mail.clear();

    // Open the window from the trusted device, then the unified endpoint (re)sends a fresh code.
    await w.app.inject({ method: "POST", url: "/v1/auth/login/enable", headers: bearer(trusted.token) });
    expect(w.mail.outbox).to.have.length(1);
    const resend = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: { email, purpose: "login" },
    });
    expect(resend.statusCode).to.equal(202);
    expect(w.mail.outbox.length).to.be.greaterThan(1); // window open → a code went out

    // The freshest code verifies.
    const code = codeFromLastMail(w.mail, email);
    const verify = await w.app.inject({ method: "POST", url: "/v1/auth/login/verify", payload: { email, code } });
    expect(verify.statusCode).to.equal(200);
  });
});
