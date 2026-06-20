// MailerService role routing + primary→failover behaviour, using the noop fixture and a stub that
// always fails. No external mail vendors are contacted.

import { expect } from "chai";
import { MailerService, type MailAdapter, type MailMessage } from "../src/services/mailer/mailer.js";
import type { MailerVendor } from "../src/config.js";
import { NoopMailAdapter } from "../src/services/mailer/adapters/noop.js";

class FailingAdapter implements MailAdapter {
  constructor(readonly vendor: MailerVendor) {}
  async send(_msg: MailMessage): Promise<void> {
    throw new Error("simulated vendor outage");
  }
}

const MSG: MailMessage = { to: "user@example.com", subject: "hi", text: "body" };

describe("07 mailer: role routing + failover", () => {
  it("falls over from a failing primary to the next adapter", async () => {
    const noop = new NoopMailAdapter();
    const mailer = new MailerService(
      "from@oursay.ca",
      { registration: ["smtp", "noop"], recovery: ["noop"] },
      new Map<MailerVendor, MailAdapter>([
        ["smtp", new FailingAdapter("smtp")],
        ["noop", noop],
      ]),
    );

    const result = await mailer.send("registration", MSG);
    expect(result.vendor).to.equal("noop");
    expect(noop.outbox).to.have.length(1);
  });

  it("throws when every adapter for a role fails", async () => {
    const mailer = new MailerService(
      "from@oursay.ca",
      { registration: ["smtp", "ses"], recovery: ["noop"] },
      new Map<MailerVendor, MailAdapter>([
        ["smtp", new FailingAdapter("smtp")],
        ["ses", new FailingAdapter("ses")],
      ]),
    );
    let threw = false;
    try {
      await mailer.send("registration", MSG);
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });

  it("routes different roles to different adapters", async () => {
    const reg = new NoopMailAdapter();
    const rec = new NoopMailAdapter();
    const mailer = new MailerService(
      "from@oursay.ca",
      { registration: ["postmark"], recovery: ["noop"] },
      new Map<MailerVendor, MailAdapter>([
        ["postmark", reg],
        ["noop", rec],
      ]),
    );
    await mailer.send("recovery", MSG);
    expect(rec.outbox).to.have.length(1);
    expect(reg.outbox).to.have.length(0);
  });
});
