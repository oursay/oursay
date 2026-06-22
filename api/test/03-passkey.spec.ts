// Passkey register + login happy path against the REAL @simplewebauthn/server, driven by the
// software authenticator (test/fixtures/webauthn). Covers enrollment, login (→ session), and the
// key failure modes. No browser needed in CI.

import { randomBytes, randomUUID } from "node:crypto";
import { expect } from "chai";
import { webauthnConfig } from "../src/config.js";
import { SoftAuthenticator } from "./fixtures/webauthn/soft-authenticator.js";
import { resetWorld, type World } from "./helpers/world.js";
import { expectServiceError } from "./helpers/expect.js";

async function makeUser(w: World, handle = "@passkeyuser"): Promise<string> {
  const userId = randomUUID();
  await w.services.repos.user.create({ id: userId, handle });
  return userId;
}

function newAuthenticator(): SoftAuthenticator {
  return new SoftAuthenticator(webauthnConfig.rpID, webauthnConfig.origin);
}

describe("03 passkey: enroll, login, failures", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("enrolls a passkey and logs in with it", async () => {
    const userId = await makeUser(w);
    const auth = newAuthenticator();

    const regOptions = await w.services.passkeyService.registerOptions({
      userId,
      userName: "passkey@example.com",
      userDisplayName: "Passkey User",
    });
    const reg = await w.services.passkeyService.registerVerify({ userId, response: auth.register(regOptions.challenge) });
    expect(reg.credentialId).to.be.a("string");

    const stored = await w.services.repos.passkey.getByCredentialId(reg.credentialId);
    expect(stored?.userId).to.equal(userId);

    // Login (usernameless) with the same authenticator.
    const loginOptions = await w.services.passkeyService.loginOptions({ emailRaw: null });
    const result = await w.services.passkeyService.loginVerify({ response: auth.authenticate(loginOptions.challenge) });
    expect(result.userId).to.equal(userId);
    expect(result.session.scope).to.equal("full");

    // The issued session resolves.
    const session = await w.services.authService.resolve(result.session.token);
    expect(session?.userId).to.equal(userId);
  });

  it("enrolls a SECOND passkey for the same user (add device) and logs in with either", async () => {
    const userId = await makeUser(w, "@multidevice");
    const deviceA = newAuthenticator();
    const deviceB = newAuthenticator();

    // Device A enrolls.
    const optsA = await w.services.passkeyService.registerOptions({ userId, userName: "a@example.com", userDisplayName: "A" });
    await w.services.passkeyService.registerVerify({ userId, response: deviceA.register(optsA.challenge) });

    // Device B enrolls a SECOND, independent credential for the same account.
    const optsB = await w.services.passkeyService.registerOptions({ userId, userName: "a@example.com", userDisplayName: "A" });
    const regB = await w.services.passkeyService.registerVerify({ userId, response: deviceB.register(optsB.challenge) });
    expect(regB.credentialId).to.be.a("string");

    const stored = await w.services.repos.passkey.listByUserId(userId);
    expect(stored).to.have.length(2);

    // Either device can log in to the same account.
    const optsLoginB = await w.services.passkeyService.loginOptions({ emailRaw: null });
    const loginB = await w.services.passkeyService.loginVerify({ response: deviceB.authenticate(optsLoginB.challenge) });
    expect(loginB.userId).to.equal(userId);

    const optsLoginA = await w.services.passkeyService.loginOptions({ emailRaw: null });
    const loginA = await w.services.passkeyService.loginVerify({ response: deviceA.authenticate(optsLoginA.challenge) });
    expect(loginA.userId).to.equal(userId);
  });

  it("rejects registration against an unknown challenge", async () => {
    const userId = await makeUser(w);
    const auth = newAuthenticator();
    const bogusChallenge = Buffer.from(randomBytes(32)).toString("base64url");
    await expectServiceError(
      () => w.services.passkeyService.registerVerify({ userId, response: auth.register(bogusChallenge) }),
      "challenge_invalid",
    );
  });

  it("rejects login for an unknown credential", async () => {
    const auth = newAuthenticator(); // never enrolled
    const loginOptions = await w.services.passkeyService.loginOptions({ emailRaw: null });
    await expectServiceError(
      () => w.services.passkeyService.loginVerify({ response: auth.authenticate(loginOptions.challenge) }),
      "passkey_verification_failed",
    );
  });
});

describe("03b passkey management: list + revoke (kick a device)", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  /** Enroll one passkey from a fresh authenticator and return its stored uuid `id`. */
  async function enroll(userId: string): Promise<string> {
    const auth = newAuthenticator();
    const opts = await w.services.passkeyService.registerOptions({ userId, userName: "a@example.com", userDisplayName: "A" });
    const reg = await w.services.passkeyService.registerVerify({ userId, response: auth.register(opts.challenge) });
    const stored = await w.services.repos.passkey.getByCredentialId(reg.credentialId);
    return stored!.id;
  }

  it("lists the caller's passkeys and revokes one (keeping the rest)", async () => {
    const userId = await makeUser(w, "@manage");
    await enroll(userId);
    const idB = await enroll(userId);
    const token = (await w.services.authService.issue(userId, "full", "test")).token;

    const list = await w.app.inject({ method: "GET", url: "/v1/auth/passkeys", headers: bearer(token) });
    expect(list.statusCode).to.equal(200);
    expect((list.json() as { passkeys: unknown[] }).passkeys).to.have.length(2);

    const revoke = await w.app.inject({ method: "POST", url: "/v1/auth/passkey/revoke", headers: bearer(token), payload: { id: idB } });
    expect(revoke.statusCode).to.equal(204);
    expect(await w.services.repos.passkey.listByUserId(userId)).to.have.length(1);
  });

  it("refuses to remove the LAST passkey (avoid lockout) → 403", async () => {
    const userId = await makeUser(w, "@lastkey");
    const id = await enroll(userId);
    const token = (await w.services.authService.issue(userId, "full", "test")).token;

    const res = await w.app.inject({ method: "POST", url: "/v1/auth/passkey/revoke", headers: bearer(token), payload: { id } });
    expect(res.statusCode).to.equal(403);
    expect(await w.services.repos.passkey.listByUserId(userId)).to.have.length(1);
  });

  it("cannot revoke another user's passkey → 404 (owner-scoped)", async () => {
    const owner = await makeUser(w, "@owner");
    await enroll(owner);
    const targetId = await enroll(owner); // owner has 2 so the guard isn't what trips

    const other = await makeUser(w, "@other");
    await enroll(other);
    const otherToken = (await w.services.authService.issue(other, "full", "test")).token;

    const res = await w.app.inject({ method: "POST", url: "/v1/auth/passkey/revoke", headers: bearer(otherToken), payload: { id: targetId } });
    expect(res.statusCode).to.equal(404);
    expect(await w.services.repos.passkey.listByUserId(owner)).to.have.length(2);
  });

  it("revoking a passkey kills that device's session and blocks its future login", async () => {
    const userId = await makeUser(w, "@kick");

    // Device A: enroll + login → a session PAIRED to passkey A.
    const a = newAuthenticator();
    const optsA = await w.services.passkeyService.registerOptions({ userId, userName: "a@example.com", userDisplayName: "A" });
    const regA = await w.services.passkeyService.registerVerify({ userId, response: a.register(optsA.challenge) });
    const sessA = await w.services.passkeyService.loginVerify({
      response: a.authenticate((await w.services.passkeyService.loginOptions({ emailRaw: null })).challenge),
    });

    // Device B: enroll + login (a second passkey, so A isn't the last) → its own paired session.
    const b = newAuthenticator();
    const optsB = await w.services.passkeyService.registerOptions({ userId, userName: "a@example.com", userDisplayName: "A" });
    await w.services.passkeyService.registerVerify({ userId, response: b.register(optsB.challenge) });
    const sessB = await w.services.passkeyService.loginVerify({
      response: b.authenticate((await w.services.passkeyService.loginOptions({ emailRaw: null })).challenge),
    });

    expect(await w.services.authService.resolve(sessA.session.token)).to.not.be.null;
    expect(await w.services.authService.resolve(sessB.session.token)).to.not.be.null;

    // Kick device A from device B's (still valid) full session.
    const creds = await w.services.repos.passkey.listByUserId(userId);
    const aId = creds.find((c) => c.credentialId === regA.credentialId)!.id;
    const revoke = await w.app.inject({ method: "POST", url: "/v1/auth/passkey/revoke", headers: bearer(sessB.session.token), payload: { id: aId } });
    expect(revoke.statusCode).to.equal(204);

    // Device A's session is cut off immediately; device B's survives.
    expect(await w.services.authService.resolve(sessA.session.token)).to.be.null;
    expect(await w.services.authService.resolve(sessB.session.token)).to.not.be.null;

    // Device A can no longer log in (credential removed); device B still can.
    await expectServiceError(
      async () => w.services.passkeyService.loginVerify({ response: a.authenticate((await w.services.passkeyService.loginOptions({ emailRaw: null })).challenge) }),
      "passkey_verification_failed",
    );
    const okB = await w.services.passkeyService.loginVerify({
      response: b.authenticate((await w.services.passkeyService.loginOptions({ emailRaw: null })).challenge),
    });
    expect(okB.userId).to.equal(userId);
  });

  it("requires a full session (recovery scope cannot manage devices) and a session at all", async () => {
    const userId = await makeUser(w, "@scoped");
    await enroll(userId);
    const recovery = (await w.services.authService.issue(userId, "recovery", "test")).token;

    const limited = await w.app.inject({ method: "GET", url: "/v1/auth/passkeys", headers: bearer(recovery) });
    expect(limited.statusCode).to.equal(403);

    const anon = await w.app.inject({ method: "GET", url: "/v1/auth/passkeys" });
    expect(anon.statusCode).to.equal(401);
  });
});
