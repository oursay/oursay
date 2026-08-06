// Recovery branch: unverified accounts recover via email OTP (limited recovery session); verified
// accounts get a recovery_kyc challenge and must complete Didit biometric before passkey re-enroll.
// A2: recovery-scoped passkey enroll is an atomic credential reset (wipe prior passkeys + sessions).

import { randomUUID } from "node:crypto";
import { expect } from "chai";
import { sessionConfig, webauthnConfig, kycConfig } from "../src/config.js";
import { hashEnrollmentAuthorization } from "../src/helpers/tokens.js";
import { KycSessionRepo } from "../src/repo/kyc-session.repo.js";
import { KycSessionService } from "../src/services/kyc-session.service.js";
import { KycService } from "../src/services/kyc.service.js";
import { DiditKycProvider } from "../src/services/kyc/index.js";
import { RecoveryService } from "../src/services/recovery.service.js";
import { SoftAuthenticator } from "./fixtures/webauthn/soft-authenticator.js";
import { makeAccount as makeSharedAccount } from "./helpers/account.js";
import { expectServiceError } from "./helpers/expect.js";
import { codeFromLastMail, resetWorld, type World } from "./helpers/world.js";

async function makeAccount(w: World, email: string): Promise<string> {
  return (await makeSharedAccount(w, { email })).userId;
}

const RECOVER_WORKFLOW = "45a1c557-494f-481f-baea-dda4b7a1a5c0";
const RECOVER_SESSION = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

function fakeFetch(handler: (url: string, method: string) => { status?: number; body: unknown }): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const result = handler(url, method);
    return new Response(JSON.stringify(result.body), {
      status: result.status ?? (method === "POST" ? 201 : 200),
      headers: { "content-type": "application/json" },
    });
  };
}

function newAuthenticator(): SoftAuthenticator {
  return new SoftAuthenticator(webauthnConfig.rpID, webauthnConfig.origin);
}

async function enrollBootstrap(
  w: World,
  userId: string,
  email: string,
  auth: SoftAuthenticator,
): Promise<string> {
  const opts = await w.services.passkeyService.registerOptions({
    userId,
    userName: email,
    userDisplayName: "Recovery User",
    scope: "registration",
  });
  const reg = await w.services.passkeyService.registerVerify({
    userId,
    response: auth.register(opts.challenge),
    scope: "registration",
  });
  return reg.credentialId;
}

async function recoverSession(
  w: World,
  email: string,
): Promise<{ userId: string; token: string; sessionId: string }> {
  await w.services.recoveryService.requestRecovery({ emailRaw: email });
  const code = codeFromLastMail(w.mail, email);
  const result = await w.services.recoveryService.verifyRecovery({ emailRaw: email, code });
  expect(result.status).to.equal("passkey_reenroll");
  if (result.status !== "passkey_reenroll") throw new Error("expected passkey_reenroll");
  const resolved = await w.services.authService.resolve(result.session.token);
  expect(resolved).to.not.be.null;
  return { userId: result.userId, token: result.session.token, sessionId: resolved!.id };
}

async function recoveryEnrollViaHttp(
  w: World,
  token: string,
  auth: SoftAuthenticator,
): Promise<{ statusCode: number; credentialId?: string }> {
  const opts = await w.app.inject({
    method: "POST",
    url: "/v1/auth/passkey/register/options",
    headers: bearer(token),
    payload: {},
  });
  if (opts.statusCode !== 200) return { statusCode: opts.statusCode };
  const challenge = (opts.json() as { challenge: string }).challenge;
  const verify = await w.app.inject({
    method: "POST",
    url: "/v1/auth/passkey/register/verify",
    headers: bearer(token),
    payload: { response: auth.register(challenge) },
  });
  if (verify.statusCode !== 201) return { statusCode: verify.statusCode };
  return {
    statusCode: 201,
    credentialId: (verify.json() as { credentialId: string }).credentialId,
  };
}

function buildDiditRecovery(w: World): RecoveryService {
  const didit = new DiditKycProvider(
    {
      ...kycConfig.didit,
      apiKey: "test-api-key",
      webhookSecret: "test-secret",
      workflowId: "11111111-1111-1111-1111-111111111111",
      poaWorkflowId: "22222222-2222-2222-2222-222222222222",
      recoverWorkflowId: RECOVER_WORKFLOW,
      baseUrl: "https://verification.didit.me",
    },
    fakeFetch((url, method) => {
      if (method === "POST" && url.endsWith("/v3/session/")) {
        return {
          body: {
            session_id: RECOVER_SESSION,
            url: "https://verify.didit.me/session/recover",
            status: "Not Started",
            workflow_id: RECOVER_WORKFLOW,
          },
        };
      }
      if (method === "GET" && url.includes(`/v3/session/${RECOVER_SESSION}/decision/`)) {
        return {
          body: {
            session_id: RECOVER_SESSION,
            status: "Approved",
            workflow_id: RECOVER_WORKFLOW,
          },
        };
      }
      throw new Error(`unexpected ${method} ${url}`);
    }),
  );
  const kycService = new KycService({
    provider: didit,
    recordStore: w.services.recordStore,
    kycRepo: w.services.repos.kyc,
  });
  const kycSessionService = new KycSessionService({
    sessionProvider: didit,
    kycService,
    sessionRepo: new KycSessionRepo(w.db.pool),
    participantGeoService: w.services.participantGeoService,
    geocodeService: w.services.geocodeService,
    diditProvider: didit,
  });
  return new RecoveryService({
    otpService: w.services.otpService,
    profileRepo: w.services.repos.profile,
    kycRepo: w.services.repos.kyc,
    authService: w.services.authService,
    kycSessionService,
  });
}

describe("05 recovery: kyc_tier branch", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("does not email a code for an unknown account (no enumeration)", async () => {
    await w.services.recoveryService.requestRecovery({ emailRaw: "ghost@example.com" });
    expect(w.mail.outbox).to.have.length(0);
  });

  it("recovers an unverified account into a recovery-scoped session", async () => {
    const email = "recover@example.com";
    const userId = await makeAccount(w, email);

    await w.services.recoveryService.requestRecovery({ emailRaw: email });
    const code = codeFromLastMail(w.mail, email);

    const result = await w.services.recoveryService.verifyRecovery({ emailRaw: email, code });
    expect(result.status).to.equal("passkey_reenroll");
    expect(result.userId).to.equal(userId);
    expect(result.session.scope).to.equal("recovery");

    // A recovery session cannot perform full actions (e.g. read profile).
    const res = await w.app.inject({
      method: "GET",
      url: "/v1/profile",
      headers: { authorization: `Bearer ${result.session.token}` },
    });
    expect(res.statusCode).to.equal(403);
  });

  it("revokes prior sessions on recovery (a lost device can't ride through)", async () => {
    const email = "revoke@example.com";
    const userId = await makeAccount(w, email);

    // Device A holds a live full session before recovery.
    const deviceA = await w.services.authService.issue(userId, "full", "device-a");
    expect((await w.services.authService.resolve(deviceA.token))?.userId).to.equal(userId);

    // Device B recovers the account.
    await w.services.recoveryService.requestRecovery({ emailRaw: email });
    const code = codeFromLastMail(w.mail, email);
    const result = await w.services.recoveryService.verifyRecovery({
      emailRaw: email,
      code,
      userAgent: "device-b",
    });

    // Device A's session no longer resolves; the new recovery session does.
    expect(await w.services.authService.resolve(deviceA.token)).to.equal(null);
    expect((await w.services.authService.resolve(result.session.token))?.scope).to.equal("recovery");
  });

  it("requires KYC re-verification for a verified account (recovery_kyc challenge)", async () => {
    const email = "verified@example.com";
    const userId = await makeAccount(w, email);
    await w.db.pool.query(
      `INSERT INTO public.kyc_attestations (id, user_id, provider, tier) VALUES ($1, $2, 'stub', 'identity_verified')`,
      [randomUUID(), userId],
    );

    await w.services.recoveryService.requestRecovery({ emailRaw: email });
    const code = codeFromLastMail(w.mail, email);

    const result = await w.services.recoveryService.verifyRecovery({ emailRaw: email, code });
    expect(result.status).to.equal("kyc_reverification_required");
    expect(result.userId).to.equal(userId);
    expect(result.session.scope).to.equal("recovery_kyc");

    // recovery_kyc cannot enroll a passkey yet.
    const enroll = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: { authorization: `Bearer ${result.session.token}` },
      payload: {},
    });
    expect(enroll.statusCode).to.equal(403);

    // Without Didit, starting biometric recovery is not implemented.
    const kycStart = await w.app.inject({
      method: "POST",
      url: "/v1/auth/recovery/kyc/session",
      headers: { authorization: `Bearer ${result.session.token}` },
    });
    expect(kycStart.statusCode).to.equal(501);
  });

  it("unlocks passkey re-enroll after approved Didit biometric recovery (no new attestation)", async () => {
    const email = "verified-biometric@example.com";
    const userId = await makeAccount(w, email);
    await w.db.pool.query(
      `INSERT INTO public.kyc_attestations (id, user_id, provider, tier) VALUES ($1, $2, 'didit', 'identity_verified')`,
      [randomUUID(), userId],
    );

    const recovery = buildDiditRecovery(w);

    await recovery.requestRecovery({ emailRaw: email });
    const code = codeFromLastMail(w.mail, email);
    const challenge = await recovery.verifyRecovery({ emailRaw: email, code });
    expect(challenge.status).to.equal("kyc_reverification_required");

    const started = await recovery.startRecoveryKyc(userId);
    expect(started.sessionId).to.equal(RECOVER_SESSION);

    const unlocked = await recovery.pollRecoveryKyc(userId, RECOVER_SESSION, "device-b");
    expect(unlocked.status).to.equal("approved");
    if (unlocked.status !== "approved") throw new Error("expected approved");
    expect(unlocked.passkeyReenroll.session.scope).to.equal("recovery");

    const attestCount = await w.db.pool.query(
      `SELECT COUNT(*)::int AS n FROM public.kyc_attestations WHERE user_id = $1`,
      [userId],
    );
    expect(attestCount.rows[0].n).to.equal(1);

    const enroll = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: { authorization: `Bearer ${unlocked.passkeyReenroll.session.token}` },
      payload: {},
    });
    expect(enroll.statusCode).to.equal(200);
  });
});

describe("05b recovery: atomic credential reset (A2)", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });
  afterEach(() => {
    w.passkeyRepoInstrumentation!.afterRecoveryCredentialDelete = undefined;
    w.passkeyRepoInstrumentation!.beforeRecoveryCredentialInsert = undefined;
  });

  it("after recovery enroll, pre-recovery credentials fail and only the replacement succeeds", async () => {
    const email = "reset-creds@example.com";
    const { userId } = await makeSharedAccount(w, { email });
    const deviceA = newAuthenticator();
    const deviceB = newAuthenticator();
    const deviceC = newAuthenticator();

    await enrollBootstrap(w, userId, email, deviceA);
    await enrollBootstrap(w, userId, email, deviceB);
    expect(await w.services.repos.passkey.listByUserId(userId)).to.have.length(2);

    const recovery = await recoverSession(w, email);
    const enrolled = await recoveryEnrollViaHttp(w, recovery.token, deviceC);
    expect(enrolled.statusCode).to.equal(201);

    const remaining = await w.services.repos.passkey.listByUserId(userId);
    expect(remaining).to.have.length(1);
    expect(remaining[0]!.credentialId).to.equal(enrolled.credentialId);

    await expectServiceError(
      async () => {
        const opts = await w.services.passkeyService.loginOptions({ emailRaw: null });
        await w.services.passkeyService.loginVerify({
          response: deviceA.authenticate(opts.challenge),
        });
      },
      "passkey_verification_failed",
    );
    await expectServiceError(
      async () => {
        const opts = await w.services.passkeyService.loginOptions({ emailRaw: null });
        await w.services.passkeyService.loginVerify({
          response: deviceB.authenticate(opts.challenge),
        });
      },
      "passkey_verification_failed",
    );

    const loginC = await w.services.passkeyService.loginVerify({
      response: deviceC.authenticate(
        (await w.services.passkeyService.loginOptions({ emailRaw: null })).challenge,
      ),
    });
    expect(loginC.userId).to.equal(userId);
    expect(loginC.session.scope).to.equal("full");

    expect(await w.services.authService.resolve(recovery.token)).to.equal(null);

    const reOpts = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: bearer(recovery.token),
      payload: {},
    });
    expect(reOpts.statusCode).to.equal(401);
  });

  it("concurrent old-passkey login during reset leaves no active full session from the old credential", async () => {
    const email = "race-login@example.com";
    const { userId } = await makeSharedAccount(w, { email });
    const deviceA = newAuthenticator();
    const deviceC = newAuthenticator();
    await enrollBootstrap(w, userId, email, deviceA);

    const recovery = await recoverSession(w, email);
    const opts = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: bearer(recovery.token),
      payload: {},
    });
    expect(opts.statusCode).to.equal(200);
    const challenge = (opts.json() as { challenge: string }).challenge;
    const response = deviceC.register(challenge);

    const loginOpts = await w.services.passkeyService.loginOptions({ emailRaw: null });
    const loginAssertion = deviceA.authenticate(loginOpts.challenge);

    // Hold finalize after credential deletion so the old assertion deterministically races the
    // delete-before-revoke boundary under test.
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    let reachedBarrier!: () => void;
    const atBarrier = new Promise<void>((resolve) => {
      reachedBarrier = resolve;
    });
    w.passkeyRepoInstrumentation!.afterRecoveryCredentialDelete = async () => {
      reachedBarrier();
      await barrier;
    };

    const finalizePromise = w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/verify",
      headers: bearer(recovery.token),
      payload: { response },
    });
    await atBarrier;

    const loginPromise = w.services.passkeyService
      .loginVerify({ response: loginAssertion })
      .then((r) => ({ ok: true as const, token: r.session.token }))
      .catch(() => ({ ok: false as const }));

    releaseBarrier();
    const [finalizeRes, loginRes] = await Promise.all([finalizePromise, loginPromise]);
    expect(finalizeRes.statusCode).to.equal(201);

    if (loginRes.ok) {
      expect(await w.services.authService.resolve(loginRes.token)).to.equal(null);
    }

    const activeFull = await w.db.pool.query(
      `SELECT COUNT(*)::int AS n FROM auth.sessions
        WHERE user_id = $1 AND scope = 'full' AND revoked_at IS NULL AND expires_at > now()`,
      [userId],
    );
    expect(activeFull.rows[0].n).to.equal(0);
    expect(await w.services.repos.passkey.listByUserId(userId)).to.have.length(1);
  });

  it("competing recovery sessions: exactly one enroll wins; loser is forbidden", async () => {
    const email = "compete@example.com";
    const { userId } = await makeSharedAccount(w, { email });
    await enrollBootstrap(w, userId, email, newAuthenticator());

    const r1 = await w.services.authService.issue(userId, "recovery", "r1");
    const r2 = await w.services.authService.issue(userId, "recovery", "r2");
    const s1 = (await w.services.authService.resolve(r1.token))!;
    const s2 = (await w.services.authService.resolve(r2.token))!;

    const auth1 = newAuthenticator();
    const auth2 = newAuthenticator();
    const opts1 = await w.services.passkeyService.registerOptions({
      userId,
      userName: email,
      userDisplayName: "R1",
      scope: "recovery",
      sessionId: s1.id,
    });
    const opts2 = await w.services.passkeyService.registerOptions({
      userId,
      userName: email,
      userDisplayName: "R2",
      scope: "recovery",
      sessionId: s2.id,
    });
    const response1 = auth1.register(opts1.challenge);
    const response2 = auth2.register(opts2.challenge);

    const [v1, v2] = await Promise.all([
      w.app.inject({
        method: "POST",
        url: "/v1/auth/passkey/register/verify",
        headers: bearer(r1.token),
        payload: { response: response1 },
      }),
      w.app.inject({
        method: "POST",
        url: "/v1/auth/passkey/register/verify",
        headers: bearer(r2.token),
        payload: { response: response2 },
      }),
    ]);

    const statuses = [v1.statusCode, v2.statusCode].sort((a, b) => a - b);
    expect(statuses[0]).to.equal(201);
    // Loser: 403 if authenticate won the race but finalize saw a revoked session; 401 if
    // authenticate ran after the winner's blanket revoke.
    expect(statuses[1]).to.be.oneOf([401, 403]);
    expect(await w.services.repos.passkey.listByUserId(userId)).to.have.length(1);
    expect(await w.services.authService.resolve(r1.token)).to.equal(null);
    expect(await w.services.authService.resolve(r2.token)).to.equal(null);
  });

  it("recovery reset invalidates outstanding enrollment authorizations", async () => {
    const email = "grant-wipe@example.com";
    const { userId } = await makeSharedAccount(w, { email });
    const deviceA = newAuthenticator();
    await enrollBootstrap(w, userId, email, deviceA);

    const stepOpts = await w.services.passkeyService.enrollAuthOptions(userId);
    const grant = await w.services.passkeyService.enrollAuthVerify({
      userId,
      response: deviceA.authenticate(stepOpts.challenge),
    });
    const tokenHash = hashEnrollmentAuthorization(grant.enrollmentAuthorization, sessionConfig.secret);
    expect(await w.services.repos.passkey.getActiveEnrollmentAuth(tokenHash)).to.not.be.null;

    const recovery = await recoverSession(w, email);
    const deviceC = newAuthenticator();
    expect((await recoveryEnrollViaHttp(w, recovery.token, deviceC)).statusCode).to.equal(201);

    expect(await w.services.repos.passkey.getActiveEnrollmentAuth(tokenHash)).to.equal(null);

    const full2 = await w.services.passkeyService.loginVerify({
      response: deviceC.authenticate(
        (await w.services.passkeyService.loginOptions({ emailRaw: null })).challenge,
      ),
    });
    const denied = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: bearer(full2.session.token),
      payload: { enrollmentAuthorization: grant.enrollmentAuthorization },
    });
    expect(denied.statusCode).to.equal(403);
  });

  it("replacement-insert failure rolls back wipe so the ceremony can be retried", async () => {
    const email = "rollback-recovery@example.com";
    const { userId } = await makeSharedAccount(w, { email });
    const deviceA = newAuthenticator();
    const deviceC = newAuthenticator();
    const oldCredId = await enrollBootstrap(w, userId, email, deviceA);

    const recovery = await recoverSession(w, email);
    const opts = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/options",
      headers: bearer(recovery.token),
      payload: {},
    });
    const challenge = (opts.json() as { challenge: string }).challenge;
    const response = deviceC.register(challenge);

    // credential_id is globally unique. Park the replacement id under another user so recovery's
    // per-user DELETE does not clear it and the replacement INSERT fails uniqueness (mirrors 46).
    const other = await makeSharedAccount(w, { email: "rollback-other@example.com" });
    await w.db.pool.query(
      `INSERT INTO auth.passkey_credentials
         (id, user_id, credential_id, public_key, counter, transports, aaguid, label)
       VALUES ($1,$2,$3,$4,0,null,null,null)`,
      [randomUUID(), other.userId, response.id, Buffer.from([1, 2, 3])],
    );

    const failed = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/verify",
      headers: bearer(recovery.token),
      payload: { response },
    });
    expect(failed.statusCode).to.equal(500);

    const listed = await w.services.repos.passkey.listByUserId(userId);
    expect(listed.some((c) => c.credentialId === oldCredId)).to.equal(true);
    expect(await w.services.authService.resolve(recovery.token)).to.not.be.null;
    expect(await w.services.repos.passkey.getActiveChallenge(challenge, "register")).to.not.be.null;

    await w.db.pool.query(`DELETE FROM auth.passkey_credentials WHERE credential_id = $1`, [response.id]);

    const retry = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/verify",
      headers: bearer(recovery.token),
      payload: { response },
    });
    expect(retry.statusCode).to.equal(201);
    expect(await w.services.repos.passkey.listByUserId(userId)).to.have.length(1);
  });

  it("registration challenge bound to recovery session R1 cannot finalize under R2", async () => {
    const email = "cross-bind@example.com";
    const { userId } = await makeSharedAccount(w, { email });
    await enrollBootstrap(w, userId, email, newAuthenticator());

    const r1 = await w.services.authService.issue(userId, "recovery", "r1");
    const r2 = await w.services.authService.issue(userId, "recovery", "r2");
    const s1 = (await w.services.authService.resolve(r1.token))!;

    const auth = newAuthenticator();
    const opts = await w.services.passkeyService.registerOptions({
      userId,
      userName: email,
      userDisplayName: "Cross",
      scope: "recovery",
      sessionId: s1.id,
    });
    const response = auth.register(opts.challenge);

    const denied = await w.app.inject({
      method: "POST",
      url: "/v1/auth/passkey/register/verify",
      headers: bearer(r2.token),
      payload: { response },
    });
    expect(denied.statusCode).to.equal(400);
    expect(await w.services.repos.passkey.listByUserId(userId)).to.have.length(1);
    expect(await w.services.authService.resolve(r1.token)).to.not.be.null;
  });

  it("Didit-approved recovery enroll uses the same credential-reset finalizer", async () => {
    const email = "kyc-reset@example.com";
    const { userId } = await makeSharedAccount(w, { email });
    const deviceA = newAuthenticator();
    const deviceC = newAuthenticator();
    await enrollBootstrap(w, userId, email, deviceA);
    await w.db.pool.query(
      `INSERT INTO public.kyc_attestations (id, user_id, provider, tier) VALUES ($1, $2, 'didit', 'identity_verified')`,
      [randomUUID(), userId],
    );

    const recovery = buildDiditRecovery(w);
    await recovery.requestRecovery({ emailRaw: email });
    const code = codeFromLastMail(w.mail, email);
    const challenge = await recovery.verifyRecovery({ emailRaw: email, code });
    expect(challenge.status).to.equal("kyc_reverification_required");
    await recovery.startRecoveryKyc(userId);
    const unlocked = await recovery.pollRecoveryKyc(userId, RECOVER_SESSION, "device-b");
    expect(unlocked.status).to.equal("approved");
    if (unlocked.status !== "approved") throw new Error("expected approved");

    const enrolled = await recoveryEnrollViaHttp(w, unlocked.passkeyReenroll.session.token, deviceC);
    expect(enrolled.statusCode).to.equal(201);
    expect(await w.services.repos.passkey.listByUserId(userId)).to.have.length(1);

    await expectServiceError(
      async () => {
        const loginOpts = await w.services.passkeyService.loginOptions({ emailRaw: null });
        await w.services.passkeyService.loginVerify({
          response: deviceA.authenticate(loginOpts.challenge),
        });
      },
      "passkey_verification_failed",
    );
  });
});
