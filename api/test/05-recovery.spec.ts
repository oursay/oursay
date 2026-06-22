// Recovery branch: unverified accounts recover via email OTP (limited recovery session); verified
// accounts (a row in public.kyc_attestations) hit the KYC re-verification policy stub.

import { randomUUID } from "node:crypto";
import { expect } from "chai";
import { codeFromLastMail, resetWorld, type World } from "./helpers/world.js";
import { expectServiceError } from "./helpers/expect.js";

async function makeAccount(w: World, email: string): Promise<string> {
  const userId = randomUUID();
  await w.services.repos.user.create({ id: userId, handle: "@recoverable" });
  await w.services.repos.profile.insert({
    userId, firstName: null, lastName: null,
    line1: null, line2: null, city: null, province: "AB", postalCode: null, country: "CA",
    memo: null, birthdate: "1985-03-03", email, emailCanonical: email.toLowerCase(),
  });
  return userId;
}

describe("05 recovery: kyc_tier branch", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("does not email a code for an unknown account (no enumeration)", async () => {
    await w.services.recoveryService.requestRecovery({ emailRaw: "ghost@example.com" });
    expect(w.mail.outbox).to.have.length(0);
  });

  it("recovers an unverified account into a recovery-scoped session", async () => {
    const email = "recover@example.com";
    const userId = await makeAccount(w, email);

    await w.services.recoveryService.requestRecovery({ emailRaw: email });
    const code = codeFromLastMail(w.mail, email);

    const result = await w.services.recoveryService.verifyRecovery({ emailRaw: email, code });
    expect(result.status).to.equal("passkey_reenroll");
    expect(result.userId).to.equal(userId);
    expect(result.session.scope).to.equal("recovery");

    // A recovery session cannot perform full actions (e.g. read profile).
    const res = await w.app.inject({
      method: "GET",
      url: "/v1/profile",
      headers: { authorization: `Bearer ${result.session.token}` },
    });
    expect(res.statusCode).to.equal(403);
  });

  it("revokes prior sessions on recovery (a lost device can't ride through)", async () => {
    const email = "revoke@example.com";
    const userId = await makeAccount(w, email);

    // Device A holds a live full session before recovery.
    const deviceA = await w.services.authService.issue(userId, "full", "device-a");
    expect((await w.services.authService.resolve(deviceA.token))?.userId).to.equal(userId);

    // Device B recovers the account.
    await w.services.recoveryService.requestRecovery({ emailRaw: email });
    const code = codeFromLastMail(w.mail, email);
    const result = await w.services.recoveryService.verifyRecovery({ emailRaw: email, code, userAgent: "device-b" });

    // Device A's session no longer resolves; the new recovery session does.
    expect(await w.services.authService.resolve(deviceA.token)).to.equal(null);
    expect((await w.services.authService.resolve(result.session.token))?.scope).to.equal("recovery");
  });

  it("requires KYC re-verification for a verified account", async () => {
    const email = "verified@example.com";
    const userId = await makeAccount(w, email);
    await w.db.pool.query(
      `INSERT INTO public.kyc_attestations (id, user_id, provider, tier) VALUES ($1, $2, 'stub', 'identity_verified')`,
      [randomUUID(), userId],
    );

    await w.services.recoveryService.requestRecovery({ emailRaw: email });
    const code = codeFromLastMail(w.mail, email);

    await expectServiceError(
      () => w.services.recoveryService.verifyRecovery({ emailRaw: email, code }),
      "kyc_reverification_required",
    );
  });
});
