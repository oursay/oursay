// End-to-end over HTTP (app.inject): register with an email OTP, enroll a passkey, log out, log
// back in with the passkey, and read a protected resource. Plus a cookie-only session check —
// the browser path authenticates with the HttpOnly session cookie and no Authorization header.
// The passkey ceremonies run against the REAL @simplewebauthn/server via the software authenticator.

import { expect } from "chai";
import { sessionConfig, webauthnConfig } from "../src/config.js";
import { SoftAuthenticator } from "./fixtures/webauthn/soft-authenticator.js";
import { codeFromLastMail, resetWorld, type World } from "./helpers/world.js";

const ADULT_DOB = "1990-06-15";

function newAuthenticator(): SoftAuthenticator {
  return new SoftAuthenticator(webauthnConfig.rpID, webauthnConfig.origin);
}

/** Pull a Set-Cookie value off an inject response by name. */
function cookieValue(res: { cookies: Array<{ name: string; value: string }> }, name: string): string {
  const c = res.cookies.find((x) => x.name === name);
  if (!c) throw new Error(`cookie ${name} not set`);
  return c.value;
}

describe("08 golden path: HTTP register → enroll → logout → login → profile", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("walks registration, passkey enrollment, logout, passkey login, and a protected read", async () => {
    const email = "golden@example.com";
    const auth = newAuthenticator();

    // 1. Request a registration code, then verify it with a profile → full session.
    const req = await w.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { email, purpose: "registration" } });
    expect(req.statusCode).to.equal(202);
    const code = codeFromLastMail(w.mail, email);

    const reg = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code, profile: { displayName: "Golden User", birthdate: ADULT_DOB } },
    });
    expect(reg.statusCode).to.equal(201);
    const regBody = reg.json() as { userId: string; session: { token: string; scope: string } };
    expect(regBody.session.scope).to.equal("full");
    const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

    // 2. Enroll a passkey over HTTP (authenticated with the registration session).
    const regOpts = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: bearer(regBody.session.token),
    });
    expect(regOpts.statusCode).to.equal(200);
    const enroll = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/verify",
      headers: bearer(regBody.session.token),
      payload: { response: auth.register((regOpts.json() as { challenge: string }).challenge) },
    });
    expect(enroll.statusCode).to.equal(201);
    expect(enroll.json().credentialId).to.be.a("string");

    // 3. Log out — the registration session is revoked.
    const logout = await w.app.inject({ method: "POST", url: "/v1/auth/logout", headers: bearer(regBody.session.token) });
    expect(logout.statusCode).to.equal(204);
    const afterLogout = await w.app.inject({ method: "GET", url: "/v1/auth/session", headers: bearer(regBody.session.token) });
    expect(afterLogout.statusCode).to.equal(401);

    // 4. Log back in with the passkey (usernameless) → a fresh full session.
    const loginOpts = await w.app.inject({ method: "POST", url: "/v1/auth/passkey/login/options", payload: {} });
    expect(loginOpts.statusCode).to.equal(200);
    const login = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/login/verify",
      payload: { response: auth.authenticate((loginOpts.json() as { challenge: string }).challenge) },
    });
    expect(login.statusCode).to.equal(200);
    const loginBody = login.json() as { userId: string; session: { token: string; scope: string } };
    expect(loginBody.userId).to.equal(regBody.userId);
    expect(loginBody.session.scope).to.equal("full");

    // 5. The login session reads a protected resource.
    const profile = await w.app.inject({ method: "GET", url: "/v1/profile", headers: bearer(loginBody.session.token) });
    expect(profile.statusCode).to.equal(200);
  });

  it("authenticates GET /v1/auth/session with the cookie alone (no Authorization header)", async () => {
    const email = "cookie@example.com";

    const req = await w.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { email, purpose: "registration" } });
    expect(req.statusCode).to.equal(202);
    const code = codeFromLastMail(w.mail, email);

    const reg = await w.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { email, code, profile: { displayName: "Cookie User", birthdate: ADULT_DOB } },
    });
    expect(reg.statusCode).to.equal(201);
    const userId = (reg.json() as { userId: string }).userId;

    // Registration set the HttpOnly session cookie; use it with NO Authorization header.
    const token = cookieValue(reg, sessionConfig.cookieName);
    const me = await w.app.inject({
      method: "GET",
      url: "/v1/auth/session",
      cookies: { [sessionConfig.cookieName]: token },
    });
    expect(me.statusCode).to.equal(200);
    expect(me.json().userId).to.equal(userId);
  });
});
