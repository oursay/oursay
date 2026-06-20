import { expect } from "chai";
import { otpConfig, sessionConfig } from "../src/config.js";
import { OtpService } from "../src/services/otp.service.js";
import { codeFromLastMail, resetWorld, type World } from "./helpers/world.js";
import { expectServiceError } from "./helpers/expect.js";

describe("01 otp: request, verify, attempts, expiry", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("emails a code that verifies once", async () => {
    await w.services.otpService.request({ emailRaw: "Alice@example.com", purpose: "registration", ip: "1.2.3.4" });
    const code = codeFromLastMail(w.mail);
    expect(code).to.match(/^\d{6}$/);

    const verified = await w.services.otpService.verify({ emailRaw: "alice@example.com", code, purpose: "registration" });
    expect(verified.emailCanonical).to.equal("alice@example.com");

    // A consumed code cannot be reused.
    await expectServiceError(
      () => w.services.otpService.verify({ emailRaw: "alice@example.com", code, purpose: "registration" }),
      "otp_invalid",
    );
  });

  it("rejects a wrong code and locks out after too many attempts", async () => {
    await w.services.otpService.request({ emailRaw: "bob@example.com", purpose: "registration" });
    for (let i = 0; i < otpConfig.maxAttempts; i++) {
      await expectServiceError(
        () => w.services.otpService.verify({ emailRaw: "bob@example.com", code: "000000", purpose: "registration" }),
        "otp_invalid",
      );
    }
    await expectServiceError(
      () => w.services.otpService.verify({ emailRaw: "bob@example.com", code: "000000", purpose: "registration" }),
      "otp_max_attempts",
    );
  });

  it("treats an expired code as invalid", async () => {
    // Issue with a clock in the past so the stored expiry is already elapsed vs the DB clock.
    const past = new OtpService({
      otpRepo: w.services.repos.otp,
      rateLimitRepo: w.services.repos.rateLimit,
      mailer: w.services.mailer,
      config: otpConfig,
      pepper: sessionConfig.secret,
      now: () => new Date(Date.now() - (otpConfig.ttlSec + 60) * 1000),
    });
    await past.request({ emailRaw: "carol@example.com", purpose: "registration" });
    const code = codeFromLastMail(w.mail);
    await expectServiceError(
      () => w.services.otpService.verify({ emailRaw: "carol@example.com", code, purpose: "registration" }),
      "otp_invalid",
    );
  });
});
