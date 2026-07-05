import { otpConfig } from "../src/config.js";
import { resetWorld, type World } from "./helpers/world.js";
import { expectServiceError } from "./helpers/expect.js";

describe("06 rate limit: OTP requests are throttled", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("blocks once the per-email window limit is exceeded", async () => {
    const email = "spammer@example.com";
    for (let i = 0; i < otpConfig.requestsPerWindow; i++) {
      await w.services.otpService.request({ emailRaw: email, purpose: "registration", ip: "9.9.9.9" });
    }
    await expectServiceError(
      () => w.services.otpService.request({ emailRaw: email, purpose: "registration", ip: "9.9.9.9" }),
      "rate_limited",
    );
  });
});
