// Passkey register + login happy path against the REAL @simplewebauthn/server, driven by the
// software authenticator (test/fixtures/webauthn). Covers enrollment, login (→ session), and the
// key failure modes. No browser needed in CI.

import { randomBytes, randomUUID } from "node:crypto";
import { expect } from "chai";
import { webauthnConfig } from "../src/config.js";
import { SoftAuthenticator } from "./fixtures/webauthn/soft-authenticator.js";
import { resetWorld, type World } from "./helpers/world.js";
import { expectServiceError } from "./helpers/expect.js";

async function makeUser(w: World, handle = "@passkeyuser"): Promise<string> {
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

  it("enrolls a SECOND passkey for the same user (add device) and logs in with either", async () => {
    const userId = await makeUser(w, "@multidevice");
    const deviceA = newAuthenticator();
    const deviceB = newAuthenticator();

    // Device A enrolls.
    const optsA = await w.services.passkeyService.registerOptions({ userId, userName: "a@example.com", userDisplayName: "A" });
    await w.services.passkeyService.registerVerify({ userId, response: deviceA.register(optsA.challenge) });

    // Device B enrolls a SECOND, independent credential for the same account.
    const optsB = await w.services.passkeyService.registerOptions({ userId, userName: "a@example.com", userDisplayName: "A" });
    const regB = await w.services.passkeyService.registerVerify({ userId, response: deviceB.register(optsB.challenge) });
    expect(regB.credentialId).to.be.a("string");

    const stored = await w.services.repos.passkey.listByUserId(userId);
    expect(stored).to.have.length(2);

    // Either device can log in to the same account.
    const optsLoginB = await w.services.passkeyService.loginOptions({ emailRaw: null });
    const loginB = await w.services.passkeyService.loginVerify({ response: deviceB.authenticate(optsLoginB.challenge) });
    expect(loginB.userId).to.equal(userId);

    const optsLoginA = await w.services.passkeyService.loginOptions({ emailRaw: null });
    const loginA = await w.services.passkeyService.loginVerify({ response: deviceA.authenticate(optsLoginA.challenge) });
    expect(loginA.userId).to.equal(userId);
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
