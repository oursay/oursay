// Enrollment step-up: a stolen full session cannot mint another passkey without a fresh assertion.
// Coverage: missing/expired/consumed grants, challenge binding, cross-account assertion rejection,
// zero-passkey full session denial, concurrent finalize, and insert-failure rollback.

import { randomUUID } from "node:crypto";
import { expect } from "chai";
import { sessionConfig, webauthnConfig } from "../src/config.js";
import { SoftAuthenticator } from "./fixtures/webauthn/soft-authenticator.js";
import { makeAccount } from "./helpers/account.js";
import { expectServiceError } from "./helpers/expect.js";
import { resetWorld, type World } from "./helpers/world.js";
import { hashEnrollmentAuthorization } from "../src/helpers/tokens.js";
import { PasskeyService } from "../src/services/passkey.service.js";

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

function newAuthenticator(): SoftAuthenticator {
  return new SoftAuthenticator(webauthnConfig.rpID, webauthnConfig.origin);
}

/** Bootstrap-enroll one passkey, then issue a full session (not passkey-paired). */
async function fullSessionWithPasskey(
  w: World,
  email: string,
): Promise<{ userId: string; token: string; auth: SoftAuthenticator }> {
  const { userId } = await makeAccount(w, { email });
  const auth = newAuthenticator();
  const opts = await w.services.passkeyService.registerOptions({
    userId,
    userName: email,
    userDisplayName: "Enroll Auth",
    scope: "registration",
  });
  await w.services.passkeyService.registerVerify({
    userId,
    response: auth.register(opts.challenge),
    scope: "registration",
  });
  const session = await w.services.authService.issue(userId, "full", "test");
  return { userId, token: session.token, auth };
}

async function mintEnrollmentAuthorization(
  w: World,
  token: string,
  auth: SoftAuthenticator,
): Promise<string> {
  const opts = await w.app.inject({
    method: "POST",
    url: "/v1/auth/passkey/enroll-auth/options",
    headers: bearer(token),
  });
  expect(opts.statusCode).to.equal(200);
  const challenge = (opts.json() as { challenge: string }).challenge;
  const verify = await w.app.inject({
    method: "POST",
    url: "/v1/auth/passkey/enroll-auth/verify",
    headers: bearer(token),
    payload: { response: auth.authenticate(challenge) },
  });
  expect(verify.statusCode).to.equal(200);
  return (verify.json() as { enrollmentAuthorization: string }).enrollmentAuthorization;
}

describe("46 passkey enroll-auth step-up", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("full session without enrollment authorization gets 403 on register", async () => {
    const { token } = await fullSessionWithPasskey(w, "stolen@example.com");
    const denied = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: bearer(token),
      payload: {},
    });
    expect(denied.statusCode).to.equal(403);
  });

  it("full session with zero passkeys cannot enroll (must use recovery)", async () => {
    const { userId } = await makeAccount(w, { email: "nopass@example.com" });
    const token = (await w.services.authService.issue(userId, "full", "test")).token;
    const denied = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: bearer(token),
      payload: {},
    });
    expect(denied.statusCode).to.equal(403);
    expect((denied.json() as { error: { message: string } }).error.message).to.include("recovery");

    const stepUp = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/enroll-auth/options",
      headers: bearer(token),
    });
    expect(stepUp.statusCode).to.equal(403);
  });

  it("fresh assertion → grant → register once; reused grant cannot register again", async () => {
    const { token, auth } = await fullSessionWithPasskey(w, "add-device@example.com");
    const grant = await mintEnrollmentAuthorization(w, token, auth);
    const device2 = newAuthenticator();

    const opts = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: bearer(token),
      payload: { enrollmentAuthorization: grant },
    });
    expect(opts.statusCode).to.equal(200);
    const challenge = (opts.json() as { challenge: string }).challenge;

    const enroll = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/verify",
      headers: bearer(token),
      payload: {
        response: device2.register(challenge),
        enrollmentAuthorization: grant,
      },
    });
    expect(enroll.statusCode).to.equal(201);

    const reused = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: bearer(token),
      payload: { enrollmentAuthorization: grant },
    });
    expect(reused.statusCode).to.equal(403);
  });

  it("expired enrollment authorization cannot register", async () => {
    const { userId, token, auth } = await fullSessionWithPasskey(w, "expired@example.com");
    const grant = await mintEnrollmentAuthorization(w, token, auth);
    const tokenHash = hashEnrollmentAuthorization(grant, sessionConfig.secret);
    await w.db.pool.query(
      `UPDATE auth.enrollment_authorizations SET expires_at = now() - interval '1 second' WHERE token_hash = $1`,
      [tokenHash],
    );

    const denied = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: bearer(token),
      payload: { enrollmentAuthorization: grant },
    });
    expect(denied.statusCode).to.equal(403);
    expect(await w.services.repos.passkey.listByUserId(userId)).to.have.length(1);
  });

  it("one grant cannot obtain two registration challenges", async () => {
    const { token, auth } = await fullSessionWithPasskey(w, "once-bound@example.com");
    const grant = await mintEnrollmentAuthorization(w, token, auth);

    const first = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: bearer(token),
      payload: { enrollmentAuthorization: grant },
    });
    expect(first.statusCode).to.equal(200);

    const second = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: bearer(token),
      payload: { enrollmentAuthorization: grant },
    });
    expect(second.statusCode).to.equal(403);
  });

  it("attacker passkey cannot satisfy victim enroll-auth challenge", async () => {
    const victim = await fullSessionWithPasskey(w, "victim@example.com");
    const attacker = await fullSessionWithPasskey(w, "attacker@example.com");

    const opts = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/enroll-auth/options",
      headers: bearer(victim.token),
    });
    expect(opts.statusCode).to.equal(200);
    const challenge = (opts.json() as { challenge: string }).challenge;

    const before = await w.services.repos.passkey.listByUserId(attacker.userId);
    const denied = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/enroll-auth/verify",
      headers: bearer(victim.token),
      payload: { response: attacker.auth.authenticate(challenge) },
    });
    expect(denied.statusCode).to.equal(403);

    const after = await w.services.repos.passkey.listByUserId(attacker.userId);
    expect(after[0]!.counter).to.equal(before[0]!.counter);
    expect(after[0]!.lastUsedAt).to.equal(before[0]!.lastUsedAt);
  });

  it("mismatched session user vs enroll-auth challenge owner gets 403 with no grant", async () => {
    const a = await fullSessionWithPasskey(w, "owner-a@example.com");
    const b = await fullSessionWithPasskey(w, "owner-b@example.com");

    const opts = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/enroll-auth/options",
      headers: bearer(a.token),
    });
    const challenge = (opts.json() as { challenge: string }).challenge;

    const denied = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/enroll-auth/verify",
      headers: bearer(b.token),
      payload: { response: a.auth.authenticate(challenge) },
    });
    expect(denied.statusCode).to.equal(403);

    const grants = await w.db.pool.query(
      `SELECT COUNT(*)::int AS n FROM auth.enrollment_authorizations WHERE user_id = $1 OR user_id = $2`,
      [a.userId, b.userId],
    );
    expect(grants.rows[0].n).to.equal(0);
  });

  it("concurrent registration verification with one grant creates exactly one credential", async () => {
    const { userId, token, auth } = await fullSessionWithPasskey(w, "race@example.com");
    const grant = await mintEnrollmentAuthorization(w, token, auth);
    const device2 = newAuthenticator();

    const opts = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: bearer(token),
      payload: { enrollmentAuthorization: grant },
    });
    const challenge = (opts.json() as { challenge: string }).challenge;
    const response = device2.register(challenge);
    const payload = { response, enrollmentAuthorization: grant };

    const [r1, r2] = await Promise.all([
      w.app.inject({
        method: "POST",
        url: "/v1/auth/passkey/register/verify",
        headers: bearer(token),
        payload,
      }),
      w.app.inject({
        method: "POST",
        url: "/v1/auth/passkey/register/verify",
        headers: bearer(token),
        payload,
      }),
    ]);

    const statuses = [r1.statusCode, r2.statusCode].sort();
    expect(statuses).to.deep.equal([201, 403]);
    expect(await w.services.repos.passkey.listByUserId(userId)).to.have.length(2);
  });

  it("credential-insert failure rolls back challenge and grant consumption so retry can succeed", async () => {
    const { userId, token, auth } = await fullSessionWithPasskey(w, "rollback@example.com");
    const grant = await mintEnrollmentAuthorization(w, token, auth);
    const device2 = newAuthenticator();

    const opts = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: bearer(token),
      payload: { enrollmentAuthorization: grant },
    });
    const challenge = (opts.json() as { challenge: string }).challenge;
    const response = device2.register(challenge);

    // Pre-insert the same credential id so finalize's INSERT fails uniqueness.
    await w.db.pool.query(
      `INSERT INTO auth.passkey_credentials
         (id, user_id, credential_id, public_key, counter, transports, aaguid, label)
       VALUES ($1,$2,$3,$4,0,null,null,null)`,
      [randomUUID(), userId, response.id, Buffer.from([1, 2, 3])],
    );

    let threw = false;
    try {
      await w.app.inject({
        method: "POST",
        url: "/v1/auth/passkey/register/verify",
        headers: bearer(token),
        payload: { response, enrollmentAuthorization: grant },
      });
    } catch {
      threw = true;
    }
    // inject catches errors into a 500 response rather than throwing; either way grant stays live.
    const tokenHash = hashEnrollmentAuthorization(grant, sessionConfig.secret);
    const grantRow = await w.services.repos.passkey.getActiveEnrollmentAuth(tokenHash);
    expect(grantRow).to.not.be.null;
    expect(grantRow!.registerChallengeId).to.not.be.null;

    // Remove the conflict and retry the same ceremony.
    await w.db.pool.query(`DELETE FROM auth.passkey_credentials WHERE credential_id = $1`, [response.id]);
    const retry = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/verify",
      headers: bearer(token),
      payload: { response, enrollmentAuthorization: grant },
    });
    expect(retry.statusCode).to.equal(201);
    expect(threw).to.equal(false); // inject path
    expect(await w.services.repos.passkey.listByUserId(userId)).to.have.length(2);
  });

  it("service-level: full scope without grant is forbidden even bypassing HTTP", async () => {
    const { userId } = await fullSessionWithPasskey(w, "svc@example.com");
    await expectServiceError(
      () =>
        w.services.passkeyService.registerOptions({
          userId,
          userName: "svc@example.com",
          userDisplayName: "Svc",
          scope: "full",
        }),
      "forbidden",
    );
  });

  it("expired grant is rejected after TTL elapses", async () => {
    const { userId } = await makeAccount(w, { email: "ttl@example.com" });
    const auth = newAuthenticator();
    const bootOpts = await w.services.passkeyService.registerOptions({
      userId,
      userName: "ttl@example.com",
      userDisplayName: "TTL",
      scope: "registration",
    });
    await w.services.passkeyService.registerVerify({
      userId,
      response: auth.register(bootOpts.challenge),
      scope: "registration",
    });

    const svc = new PasskeyService({
      passkeyRepo: w.services.repos.passkey,
      profileRepo: w.services.repos.profile,
      authService: w.services.authService,
      sessionSecret: sessionConfig.secret,
      enrollAuthTtlSec: 60,
    });
    const stepOpts = await svc.enrollAuthOptions(userId);
    const grant = await svc.enrollAuthVerify({
      userId,
      response: auth.authenticate(stepOpts.challenge),
    });
    await w.db.pool.query(
      `UPDATE auth.enrollment_authorizations
          SET expires_at = now() - interval '1 second'
        WHERE token_hash = $1`,
      [hashEnrollmentAuthorization(grant.enrollmentAuthorization, sessionConfig.secret)],
    );
    await expectServiceError(
      () =>
        svc.registerOptions({
          userId,
          userName: "ttl@example.com",
          userDisplayName: "TTL",
          scope: "full",
          enrollmentAuthorization: grant.enrollmentAuthorization,
        }),
      "forbidden",
    );
  });
});
