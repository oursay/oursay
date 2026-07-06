// Live Didit sandbox smoke: creates one Free-KYC session and writes a JSON artifact.
// Skips when api/test/.output/didit-session-create.json exists (delete to re-run).
// Requires DIDIT_API_KEY in repo-root or api/.env.

import { expect } from "chai";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { kycConfig } from "../src/config.js";
import { DiditClient } from "../src/services/kyc/didit-client.js";

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), ".output");
const OUTPUT_FILE = join(OUTPUT_DIR, "didit-session-create.json");

function hasDiditKey(): boolean {
  return Boolean(process.env.DIDIT_API_KEY?.trim() || kycConfig.didit.apiKey);
}

describe("33 didit: live session create smoke", function () {
  before(function () {
    if (existsSync(OUTPUT_FILE)) {
      // eslint-disable-next-line no-console
      console.log(`[didit smoke] skipping — artifact exists at ${OUTPUT_FILE} (delete to re-run)`);
      this.skip();
    }
    if (!hasDiditKey()) {
      // eslint-disable-next-line no-console
      console.log("[didit smoke] skipping — no DIDIT_API_KEY configured");
      this.skip();
    }
    if (!kycConfig.didit.workflowId) {
      // eslint-disable-next-line no-console
      console.log("[didit smoke] skipping — set DIDIT_WORKFLOW_ID to a published workflow in your Didit app");
      this.skip();
    }
  });

  it("creates a sandbox Didit session and records the result", async function () {
    const client = new DiditClient(kycConfig.didit);
    const vendorData = `oursay-smoke-${Date.now()}`;
    const startedAt = new Date().toISOString();

    let created;
    try {
      created = await client.createSession({
        workflowId: kycConfig.didit.workflowId,
        vendorData,
        callback: kycConfig.didit.callbackUrl || undefined,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("Invalid workflow_id") || msg.includes("HTTP 400")) {
        // eslint-disable-next-line no-console
        console.log(
          "[didit smoke] skipping — DIDIT_WORKFLOW_ID is not valid for this API key; copy a published workflow id from the Didit console",
        );
        this.skip();
      }
      throw e;
    }

    const artifact = {
      createdAt: startedAt,
      vendorData,
      sessionId: created.session_id,
      url: created.url,
      status: created.status,
      workflowId: created.workflow_id,
      baseUrl: kycConfig.didit.baseUrl,
      note: "Delete this file and re-run api/test/33-didit-session-smoke.spec.ts to create again.",
    };

    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(OUTPUT_FILE, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

    expect(created.session_id).to.be.a("string").with.length.greaterThan(10);
    expect(created.url).to.include("http");
    expect(existsSync(OUTPUT_FILE)).to.equal(true);
    // eslint-disable-next-line no-console
    console.log(`[didit smoke] wrote ${OUTPUT_FILE}`);
  });
});
