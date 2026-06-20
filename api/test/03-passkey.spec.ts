// Passkey register + login happy path against the REAL @simplewebauthn/server, driven by the
// software authenticator (test/fixtures/webauthn). Covers enrollment, login (→ session), and the
// key failure modes. No browser needed in CI.

import { randomBytes, randomUUID } from "node:crypto";
import { expect } from "chai";
import { webauthnConfig } from "../src/config.js";
import { SoftAuthenticator } from "./fixtures/webauthn/soft-authenticator.js";
import { resetWorld, type World } from "./helpers/world.js";
import { expectServiceError } from "./helpers/expect.js";

async function makeUser(w: World, handle = "Passkey User"): Promise<string> {
  const userId = randomUUID();
  await w.services.repos.user.create({ id: userId, handle });
  return userId;
}

function newAuthenticator(): SoftAuthenticator {
  return new SoftAuthenticator(webauthnConfig.rpID, webauthnConfig.origin);
}

describe("03 passkey: enroll, login, failures", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("enrolls a passkey and logs in with it", async () => {
    const userId = await makeUser(w);
    const auth = newAuthenticator();

    const regOptions = await w.services.passkeyService.registerOptions({
      userId,
      userName: "passkey@example.com",
      userDisplayName: "Passkey User",
    });
    const reg = await w.services.passkeyService.registerVerify({ userId, response: auth.register(regOptions.challenge) });
    expect(reg.credentialId).to.be.a("string");

    const stored = await w.services.repos.passkey.getByCredentialId(reg.credentialId);
    expect(stored?.userId).to.equal(userId);

    // Login (usernameless) with the same authenticator.
    const loginOptions = await w.services.passkeyService.loginOptions({ emailRaw: null });
    const result = await w.services.passkeyService.loginVerify({ response: auth.authenticate(loginOptions.challenge) });
    expect(result.userId).to.equal(userId);
    expect(result.session.scope).to.equal("full");

    // The issued session resolves.
    const session = await w.services.authService.resolve(result.session.token);
    expect(session?.userId).to.equal(userId);
  });

  it("rejects registration against an unknown challenge", async () => {
    const userId = await makeUser(w);
    const auth = newAuthenticator();
    const bogusChallenge = Buffer.from(randomBytes(32)).toString("base64url");
    await expectServiceError(
      () => w.services.passkeyService.registerVerify({ userId, response: auth.register(bogusChallenge) }),
      "challenge_invalid",
    );
  });

  it("rejects login for an unknown credential", async () => {
    const auth = newAuthenticator(); // never enrolled
    const loginOptions = await w.services.passkeyService.loginOptions({ emailRaw: null });
    await expectServiceError(
      () => w.services.passkeyService.loginVerify({ response: auth.authenticate(loginOptions.challenge) }),
      "passkey_verification_failed",
    );
  });
});
