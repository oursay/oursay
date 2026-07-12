// Recovery branch: unverified accounts recover via email OTP (limited recovery session); verified
// accounts get a recovery_kyc challenge and must complete Didit biometric before passkey re-enroll.

import { randomUUID } from "node:crypto";
import { expect } from "chai";
import { codeFromLastMail, resetWorld, type World } from "./helpers/world.js";
import { makeAccount as makeSharedAccount } from "./helpers/account.js";
import { kycConfig } from "../src/config.js";
import { KycSessionRepo } from "../src/repo/kyc-session.repo.js";
import { KycSessionService } from "../src/services/kyc-session.service.js";
import { KycService } from "../src/services/kyc.service.js";
import { DiditKycProvider } from "../src/services/kyc/index.js";
import { RecoveryService } from "../src/services/recovery.service.js";

async function makeAccount(w: World, email: string): Promise<string> {
  return (await makeSharedAccount(w, { email })).userId;
}

const RECOVER_WORKFLOW = "45a1c557-494f-481f-baea-dda4b7a1a5c0";
const RECOVER_SESSION = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

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
    const result = await w.services.recoveryService.verifyRecovery({ emailRaw: email, code, userAgent: "device-b" });

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
      diditProvider: didit,
    });
    const recovery = new RecoveryService({
      otpService: w.services.otpService,
      profileRepo: w.services.repos.profile,
      kycRepo: w.services.repos.kyc,
      authService: w.services.authService,
      kycSessionService,
    });

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
    });
    expect(enroll.statusCode).to.equal(200);
  });
});
