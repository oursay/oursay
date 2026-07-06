// Live Postmark smoke test: sends one OTP-style email and writes a JSON artifact.
// Skips when the artifact already exists (delete api/test/.output/postmark-otp-send.json to re-run).
// Requires POSTMARK_SERVER_TOKEN (or POSTMARK_TOKEN) in repo-root or api/.env.

import { expect } from "chai";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mailerConfig } from "../src/config.js";
import { deliverPostmarkEmail } from "../src/services/mailer/adapters/postmark.js";

const TEST_EMAIL = "test.walk1@oursay.ca";
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), ".output");
const OUTPUT_FILE = join(OUTPUT_DIR, "postmark-otp-send.json");

function hasPostmarkToken(): boolean {
  return Boolean(
    process.env.POSTMARK_SERVER_TOKEN?.trim() || process.env.POSTMARK_TOKEN?.trim() || mailerConfig.postmark.token,
  );
}

describe("32 postmark: live OTP email smoke", function () {
  before(function () {
    if (existsSync(OUTPUT_FILE)) {
      // eslint-disable-next-line no-console
      console.log(`[postmark smoke] skipping — artifact exists at ${OUTPUT_FILE} (delete to re-run)`);
      this.skip();
    }
    if (!hasPostmarkToken()) {
      // eslint-disable-next-line no-console
      console.log("[postmark smoke] skipping — no POSTMARK_SERVER_TOKEN configured");
      this.skip();
    }
  });

  it("sends a test OTP-style email via Postmark and records the result", async function () {
    const subject = "Your OurSay verification code";
    const text =
      "Your OurSay verification code is:\n\n" +
      "123456\n\n" +
      "It expires in 10 minutes. If you didn't request this, you can ignore this email.";

    const startedAt = new Date().toISOString();
    const messageId = await deliverPostmarkEmail(mailerConfig.from, mailerConfig.postmark.token, {
      to: TEST_EMAIL,
      subject,
      text,
    });

    const artifact = {
      sentAt: startedAt,
      to: TEST_EMAIL,
      from: mailerConfig.from,
      subject,
      vendor: "postmark",
      messageId,
      messageStream: "outbound",
      tag: "otp",
      note: "Delete this file and re-run api/test/32-postmark-otp.spec.ts to send again.",
    };

    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(OUTPUT_FILE, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

    expect(existsSync(OUTPUT_FILE)).to.equal(true);
    // eslint-disable-next-line no-console
    console.log(`[postmark smoke] wrote ${OUTPUT_FILE}`);
  });
});
