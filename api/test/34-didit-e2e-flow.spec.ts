// Live Didit ID KYC E2E: register → session create → webhook probe → poll/session artifact.
// Skips when api/test/.output/didit-e2e-flow.json exists (delete to re-run).
// Builds its OWN didit-backed world from the real DIDIT_* env, so it runs whenever the sandbox creds
// are present — independent of the ambient KYC_PROVIDER (which the shared suite forces to stub).
// Requires: DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_WEBHOOK_SECRET (repo-root or api/.env), Postgres up.

import { expect } from "chai";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { kycConfig } from "../src/config.js";
import { buildServices } from "../src/container.js";
import { Db } from "../src/db.js";
import { buildServer } from "../src/http/server.js";
import { NoopMailAdapter } from "../src/services/mailer/adapters/noop.js";
import { diditWebhookSignatureV2 } from "../src/services/kyc/didit-client.js";
import { fullSessionAccount } from "./helpers/account.js";
import type { World } from "./helpers/world.js";

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), ".output");
const OUTPUT_FILE = join(OUTPUT_DIR, "didit-e2e-flow.json");

function ready(): string | null {
  if (!kycConfig.didit.apiKey) return "DIDIT_API_KEY";
  if (!kycConfig.didit.workflowId) return "DIDIT_WORKFLOW_ID";
  if (!kycConfig.didit.webhookSecret) return "DIDIT_WEBHOOK_SECRET";
  return null;
}

/** A dedicated world whose app is wired to the real didit provider (the shared world runs stub). */
async function buildDiditWorld(): Promise<World> {
  const db = new Db();
  await db.init();
  await db.reset();
  const mail = new NoopMailAdapter();
  const services = await buildServices(db, {
    mailerOverrides: { noop: mail },
    kyc: { ...kycConfig, provider: "didit" },
  });
  const app = await buildServer(services, { rateLimit: false });
  return { db, services, app, mail };
}

describe("34 didit: live ID KYC e2e flow", function () {
  this.timeout(120_000);

  let w: World;

  before(async function () {
    if (existsSync(OUTPUT_FILE)) {
      // eslint-disable-next-line no-console
      console.log(`[didit e2e] skipping — artifact exists at ${OUTPUT_FILE} (delete to re-run)`);
      this.skip();
    }
    const missing = ready();
    if (missing) {
      // eslint-disable-next-line no-console
      console.log(`[didit e2e] skipping — missing ${missing}`);
      this.skip();
    }
    w = await buildDiditWorld();
  });

  it("starts a Didit session, accepts a signed webhook, and records the flow", async function () {
    const email = `didit-e2e-${Date.now()}@oursay.ca`;

    // 1. Webhook probe (same route ngrok forwards to)
    const probe = await w.app.inject({ method: "GET", url: "/v1/kyc/didit/webhook" });
    expect(probe.statusCode).to.equal(200);
    expect(probe.json()).to.include({ ok: true });

    // 2. Full-scope account (Didit session routes require full scope)
    const { userId, token } = await fullSessionAccount(w, email, {
      handle: `@didit${String(Date.now()).slice(-8)}`,
      displayName: "Didit E2E",
    });

    // 3. Start real Didit session
    const start = await w.app.inject({
      method: "POST",
      url: "/v1/kyc/didit/session",
      headers: { authorization: `Bearer ${token}` },
      payload: { workflowKind: "identity" },
    });
    expect(start.statusCode).to.equal(201);
    const { sessionId, url } = start.json() as { sessionId: string; url: string };
    expect(sessionId).to.match(/^[0-9a-f-]{36}$/i);
    expect(url).to.include("http");

    // 4. Signed webhook (simulates Didit → ngrok → API). Tier award still requires
    //    fetchDecision to return Approved from Didit — complete the hosted url first if this stays pending.
    const webhookPayload = {
      session_id: sessionId,
      status: "Approved",
      event_id: `e2e-${Date.now()}`,
    };
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = diditWebhookSignatureV2(kycConfig.didit.webhookSecret, webhookPayload);
    const webhook = await w.app.inject({
      method: "POST",
      url: "/v1/kyc/didit/webhook",
      headers: {
        "content-type": "application/json",
        "x-timestamp": ts,
        "x-signature-v2": sig,
      },
      payload: webhookPayload,
    });
    expect(webhook.statusCode).to.equal(200);

    // 5. Poll session status (may trigger vendor fetchDecision)
    const poll = await w.app.inject({
      method: "GET",
      url: `/v1/kyc/didit/session/${sessionId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(poll.statusCode).to.equal(200);
    const pollBody = poll.json() as { status: string; tier: string | null };

    const tierRow = await w.db.pool.query(
      `SELECT tier, provider FROM public.kyc_attestations WHERE user_id = $1 ORDER BY attested_at DESC LIMIT 1`,
      [userId],
    );

    const artifact = {
      ranAt: new Date().toISOString(),
      email,
      userId,
      sessionId,
      verificationUrl: url,
      webhookProbe: probe.json(),
      poll: pollBody,
      attestation: tierRow.rows[0] ?? null,
      note:
        "Open verificationUrl in a browser and complete Didit sandbox KYC if poll.status is not approved. " +
        "Delete this file and re-run after completing, or after a real Didit webhook via ngrok.",
    };

    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(OUTPUT_FILE, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    // eslint-disable-next-line no-console
    console.log(`[didit e2e] wrote ${OUTPUT_FILE}`);
    // eslint-disable-next-line no-console
    console.log(`[didit e2e] complete verification at: ${url}`);

    expect(existsSync(OUTPUT_FILE)).to.equal(true);
  });
});
