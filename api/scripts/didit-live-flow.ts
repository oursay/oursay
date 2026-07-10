// One-shot live Didit flow against the running API (default :8080).
// Usage: npx tsx scripts/didit-live-flow.ts

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { kycConfig } from "../src/config.js";
import { diditWebhookSignatureV2 } from "../src/services/kyc/didit-client.js";
import { fullSessionAccount } from "../test/helpers/account.js";
import { resetWorld } from "../test/helpers/world.js";

const API = `http://127.0.0.1:${process.env.PORT ?? "8080"}`;
const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), "../test/.output/didit-live-flow.json");

async function main(): Promise<void> {
  if (kycConfig.provider !== "didit") {
    throw new Error(`KYC_PROVIDER=${kycConfig.provider}; expected didit`);
  }
  if (!kycConfig.didit.workflowId) {
    throw new Error("DIDIT_WORKFLOW_ID is not set");
  }

  const probeRes = await fetch(`${API}/v1/kyc/didit/webhook`);
  const probe = await probeRes.json();
  if (!probeRes.ok) throw new Error(`webhook probe ${probeRes.status}: ${JSON.stringify(probe)}`);

  const w = await resetWorld();
  const email = `didit-live-${Date.now()}@oursay.ca`;
  const { userId, token } = await fullSessionAccount(w, email, {
    handle: `@didit${String(Date.now()).slice(-8)}`,
    displayName: "Didit Live",
  });

  const startRes = await fetch(`${API}/v1/kyc/didit/session`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ workflowKind: "identity" }),
  });
  const startBody = await startRes.json();
  if (!startRes.ok) {
    throw new Error(`session create ${startRes.status}: ${JSON.stringify(startBody)}`);
  }
  const { sessionId, url } = startBody as { sessionId: string; url: string };

  const webhookPayload = {
    session_id: sessionId,
    status: "Approved",
    event_id: `live-${Date.now()}`,
  };
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = diditWebhookSignatureV2(kycConfig.didit.webhookSecret, webhookPayload);
  const webhookRes = await fetch(`${API}/v1/kyc/didit/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-timestamp": ts,
      "x-signature-v2": sig,
    },
    body: JSON.stringify(webhookPayload),
  });
  const webhookBody = await webhookRes.json();
  if (!webhookRes.ok) {
    throw new Error(`webhook ${webhookRes.status}: ${JSON.stringify(webhookBody)}`);
  }

  const pollRes = await fetch(`${API}/v1/kyc/didit/session/${sessionId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const poll = await pollRes.json();
  if (!pollRes.ok) throw new Error(`poll ${pollRes.status}: ${JSON.stringify(poll)}`);

  const tierRow = await w.db.pool.query(
    `SELECT tier, provider, attested_at FROM public.kyc_attestations WHERE user_id = $1 ORDER BY attested_at DESC LIMIT 1`,
    [userId],
  );

  const artifact = {
    ranAt: new Date().toISOString(),
    apiBase: API,
    workflowId: kycConfig.didit.workflowId,
    email,
    userId,
    sessionId,
    verificationUrl: url,
    webhookProbe: probe,
    webhook: webhookBody,
    poll,
    attestation: tierRow.rows[0] ?? null,
  };

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(artifact, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
