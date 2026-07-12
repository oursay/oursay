// Didit KYC provider: fake-fetch unit tests + HTTP edges. Live sandbox smoke is 33-didit-session-smoke.spec.ts.

import { randomUUID } from "node:crypto";
import { expect } from "chai";
import { kycConfig } from "../src/config.js";
import { KycSessionRepo } from "../src/repo/kyc-session.repo.js";
import { KycSessionService } from "../src/services/kyc-session.service.js";
import { KycService } from "../src/services/kyc.service.js";
import { DiditClient, DiditKycProvider, diditWebhookSignatureV2 } from "../src/services/kyc/index.js";
import { makeAccount, fullSessionAccount } from "./helpers/account.js";
import { resetWorld, type World } from "./helpers/world.js";

const WEBHOOK_SECRET = "test-didit-webhook-secret";
const WORKFLOW_ID = "654c0688-66b2-4b3e-9c6f-2ce9dbcef969";
const SESSION_ID = "4c5c7f3a-1f82-4f3b-8d8e-1a8d2d2f9b7a";

function diditCfg() {
  return {
    ...kycConfig.didit,
    apiKey: "test-api-key",
    webhookSecret: WEBHOOK_SECRET,
    workflowId: WORKFLOW_ID,
    poaWorkflowId: "poa-workflow-id",
    recoverWorkflowId: "recover-workflow-id",
    baseUrl: "https://verification.didit.me",
  };
}

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

function buildDiditSessionService(w: World, fetchImpl: typeof fetch): KycSessionService {
  const didit = new DiditKycProvider(diditCfg(), fetchImpl);
  const kycService = new KycService({
    provider: didit,
    recordStore: w.services.recordStore,
    kycRepo: w.services.repos.kyc,
  });
  return new KycSessionService({
    sessionProvider: didit,
    kycService,
    sessionRepo: new KycSessionRepo(w.db.pool),
    participantGeoService: w.services.participantGeoService,
    diditProvider: didit,
  });
}

function signWebhookV2(payload: unknown, timestamp: string): Record<string, string> {
  const signature = diditWebhookSignatureV2(WEBHOOK_SECRET, payload);
  return {
    "x-timestamp": timestamp,
    "x-signature-v2": signature,
  };
}

describe("20 kyc didit: sessions, webhooks, attestations", () => {
  let w: World;

  beforeEach(async () => {
    w = await resetWorld();
  });

  it("returns 501 for Didit session start when KYC_PROVIDER=stub", async () => {
    const { token } = await fullSessionAccount(w, "stub-kyc@example.com");
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/kyc/didit/session",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).to.equal(501);
  });

  it("exposes public KYC provider flag", async () => {
    const res = await w.app.inject({ method: "GET", url: "/v1/public/kyc" });
    expect(res.statusCode).to.equal(200);
    expect(res.json()).to.deep.equal({ provider: "stub" });
  });

  it("start → poll approve awards identity_verified with provider didit", async () => {
    const { userId } = await makeAccount(w, { email: "didit-user@example.com" });
    let decisionCalls = 0;
    const svc = buildDiditSessionService(
      w,
      fakeFetch((url, method) => {
        if (method === "POST" && url.endsWith("/v3/session/")) {
          return {
            body: {
              session_id: SESSION_ID,
              url: "https://verify.didit.me/session/test",
              status: "Not Started",
              workflow_id: WORKFLOW_ID,
            },
          };
        }
        if (method === "GET" && url.includes(`/v3/session/${SESSION_ID}/decision/`)) {
          decisionCalls += 1;
          return {
            body: {
              session_id: SESSION_ID,
              status: "Approved",
              workflow_id: WORKFLOW_ID,
              id_verifications: [{ issuing_state: "AB" }],
            },
          };
        }
        throw new Error(`unexpected ${method} ${url}`);
      }),
    );

    const started = await svc.startDiditSession(userId, "identity");
    expect(started.sessionId).to.equal(SESSION_ID);

    const polled = await svc.getDiditSessionStatus(userId, SESSION_ID);
    expect(polled.status).to.equal("approved");
    expect(polled.tier).to.equal("identity_verified");

    const tier = await w.services.repos.kyc.latestTier(userId);
    expect(tier).to.equal("identity_verified");

    const attest = await w.db.pool.query(
      `SELECT provider, tier, region FROM public.kyc_attestations WHERE user_id = $1`,
      [userId],
    );
    expect(attest.rows).to.have.length(1);
    expect(attest.rows[0].provider).to.equal("didit");
    expect(attest.rows[0].region).to.equal("AB");
    expect(decisionCalls).to.be.greaterThan(0);
  });

  it("verifies Didit webhook HMAC (X-Signature-V2) and rejects bad signatures", () => {
    const client = new DiditClient(diditCfg());
    const payload = { session_id: SESSION_ID, status: "Approved", event_id: "evt-1" };
    const ts = String(Math.floor(Date.now() / 1000));
    const good = signWebhookV2(payload, ts);
    expect(client.verifyWebhook(JSON.stringify(payload), good)).to.equal(true);
    expect(
      client.verifyWebhook(JSON.stringify(payload), {
        ...good,
        "x-signature-v2": "deadbeef",
      }),
    ).to.equal(false);
  });

  it("webhook double-delivery attests only once", async () => {
    const { userId } = await makeAccount(w, { email: "didit-webhook@example.com" });
    const svc = buildDiditSessionService(
      w,
      fakeFetch((url, method) => {
        if (method === "POST" && url.endsWith("/v3/session/")) {
          return {
            body: {
              session_id: SESSION_ID,
              url: "https://verify.didit.me/session/test",
              status: "Not Started",
              workflow_id: WORKFLOW_ID,
            },
          };
        }
        if (method === "GET" && url.includes(`/v3/session/${SESSION_ID}/decision/`)) {
          return {
            body: {
              session_id: SESSION_ID,
              status: "Approved",
              workflow_id: WORKFLOW_ID,
            },
          };
        }
        throw new Error(`unexpected ${method} ${url}`);
      }),
    );

    await svc.startDiditSession(userId, "identity");
    const payload = { session_id: SESSION_ID, status: "Approved", event_id: "evt-dup" };
    const headers = signWebhookV2(payload, String(Math.floor(Date.now() / 1000)));
    await svc.handleDiditWebhook(JSON.stringify(payload), headers);
    await svc.handleDiditWebhook(JSON.stringify(payload), headers);

    const rows = await w.db.pool.query(`SELECT COUNT(*)::int AS n FROM public.kyc_attestations WHERE user_id = $1`, [
      userId,
    ]);
    expect(rows.rows[0].n).to.equal(1);
  });

  it("returns 501 for Didit webhook when KYC_PROVIDER=stub", async () => {
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/kyc/didit/webhook",
      headers: { "content-type": "application/json" },
      payload: { session_id: SESSION_ID, status: "Approved" },
    });
    expect(res.statusCode).to.equal(501);
  });

  it("recovery workflow approve does not append a KYC attestation", async () => {
    const RECOVER_WF = "recover-workflow-id";
    const RECOVER_SID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const { userId } = await makeAccount(w, { email: "didit-recover@example.com" });
    await w.db.pool.query(
      `INSERT INTO public.kyc_attestations (id, user_id, provider, tier) VALUES ($1, $2, 'didit', 'identity_verified')`,
      [randomUUID(), userId],
    );
    const svc = buildDiditSessionService(
      w,
      fakeFetch((url, method) => {
        if (method === "POST" && url.endsWith("/v3/session/")) {
          return {
            body: {
              session_id: RECOVER_SID,
              url: "https://verify.didit.me/session/recover",
              status: "Not Started",
              workflow_id: RECOVER_WF,
            },
          };
        }
        if (method === "GET" && url.includes(`/v3/session/${RECOVER_SID}/decision/`)) {
          return {
            body: {
              session_id: RECOVER_SID,
              status: "Approved",
              workflow_id: RECOVER_WF,
            },
          };
        }
        throw new Error(`unexpected ${method} ${url}`);
      }),
    );

    await svc.startDiditSession(userId, "recovery");
    const polled = await svc.getDiditSessionStatus(userId, RECOVER_SID);
    expect(polled.status).to.equal("approved");
    expect(polled.tier).to.equal(null);

    const rows = await w.db.pool.query(`SELECT COUNT(*)::int AS n FROM public.kyc_attestations WHERE user_id = $1`, [
      userId,
    ]);
    expect(rows.rows[0].n).to.equal(1);
  });
});
