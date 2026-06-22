// Civic signing device keys (docs/08 §5.4): authenticated enrollment / listing / revocation of
// public.device_keys. These are separate from account-login passkeys, and the platform stores the
// PUBLIC key only. A user may enroll several (multi-device). Revocation is owner-scoped.

import { randomUUID } from "node:crypto";
import { expect } from "chai";
import { p256 } from "@noble/curves/p256";
import { resetWorld, type World } from "./helpers/world.js";

const ADULT_DOB = "1990-06-15";
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** A fresh uncompressed SEC1 P-256 public key in hex — the platform never sees the private key. */
function newDevicePubkey(): string {
  return Buffer.from(p256.getPublicKey(p256.utils.randomPrivateKey(), false)).toString("hex");
}

async function fullSessionAccount(w: World, email: string): Promise<{ userId: string; token: string }> {
  const userId = randomUUID();
  await w.services.repos.user.create({ id: userId, handle: `@u${userId.slice(0, 8)}` });
  await w.services.repos.profile.insert({
    userId, firstName: null, lastName: null,
    line1: null, line2: null, city: null, province: "AB", postalCode: null, country: "CA",
    memo: null, birthdate: ADULT_DOB, email, emailCanonical: email.toLowerCase(),
  });
  const session = await w.services.authService.issue(userId, "full", "test");
  return { userId, token: session.token };
}

describe("11 civic devices: enroll, list, revoke (authenticated, pubkey-only)", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("rejects enrollment without a session (401)", async () => {
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/civic/devices",
      payload: { devicePubkey: newDevicePubkey() },
    });
    expect(res.statusCode).to.equal(401);
  });

  it("rejects a non-pubkey value (400)", async () => {
    const { token } = await fullSessionAccount(w, "civic-bad@example.com");
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/civic/devices",
      headers: bearer(token),
      payload: { devicePubkey: "not-a-key" },
    });
    expect(res.statusCode).to.equal(400);
  });

  it("enrolls a device (public key only) and lists it", async () => {
    const { userId, token } = await fullSessionAccount(w, "civic@example.com");
    const devicePubkey = newDevicePubkey();

    const enroll = await w.app.inject({
      method: "POST",
      url: "/v1/civic/devices",
      headers: bearer(token),
      payload: { devicePubkey, label: "Test phone" },
    });
    expect(enroll.statusCode).to.equal(201);
    expect((enroll.json() as { devicePubkey: string }).devicePubkey).to.equal(devicePubkey);

    const list = await w.app.inject({ method: "GET", url: "/v1/civic/devices", headers: bearer(token) });
    expect(list.statusCode).to.equal(200);
    const devices = (list.json() as { devices: Array<{ devicePubkey: string; label: string }> }).devices;
    expect(devices).to.have.length(1);
    expect(devices[0].devicePubkey).to.equal(devicePubkey);

    // The platform stores only the public key (it's the value we sent; no private material anywhere).
    const row = await w.db.pool.query(`SELECT user_id, device_pubkey FROM device_keys WHERE device_pubkey = $1`, [devicePubkey]);
    expect(row.rows[0].user_id).to.equal(userId);
  });

  it("supports multiple civic devices per user (multi-device)", async () => {
    const { token } = await fullSessionAccount(w, "civic-multi@example.com");
    await w.app.inject({ method: "POST", url: "/v1/civic/devices", headers: bearer(token), payload: { devicePubkey: newDevicePubkey() } });
    await w.app.inject({ method: "POST", url: "/v1/civic/devices", headers: bearer(token), payload: { devicePubkey: newDevicePubkey() } });
    const list = await w.app.inject({ method: "GET", url: "/v1/civic/devices", headers: bearer(token) });
    expect((list.json() as { devices: unknown[] }).devices).to.have.length(2);
  });

  it("revokes the caller's own device but not another user's", async () => {
    const a = await fullSessionAccount(w, "civic-a@example.com");
    const b = await fullSessionAccount(w, "civic-b@example.com");
    const devicePubkey = newDevicePubkey();
    const enroll = await w.app.inject({ method: "POST", url: "/v1/civic/devices", headers: bearer(a.token), payload: { devicePubkey } });
    expect(enroll.statusCode).to.equal(201);

    // User B cannot revoke A's device — 404 (no cross-account information leak).
    const cross = await w.app.inject({
      method: "POST",
      url: "/v1/civic/devices/revoke",
      headers: bearer(b.token),
      payload: { devicePubkey },
    });
    expect(cross.statusCode).to.equal(404);

    // Owner revokes → 204, and it drops out of the active list.
    const own = await w.app.inject({
      method: "POST",
      url: "/v1/civic/devices/revoke",
      headers: bearer(a.token),
      payload: { devicePubkey },
    });
    expect(own.statusCode).to.equal(204);
    const list = await w.app.inject({ method: "GET", url: "/v1/civic/devices", headers: bearer(a.token) });
    expect((list.json() as { devices: unknown[] }).devices).to.have.length(0);
  });

  it("requires a full session (a limited scope cannot enroll civic keys)", async () => {
    const userId = randomUUID();
    await w.services.repos.user.create({ id: userId, handle: `@u${userId.slice(0, 8)}` });
    await w.services.repos.profile.insert({
      userId, firstName: null, lastName: null,
      line1: null, line2: null, city: null, province: "AB", postalCode: null, country: "CA",
      memo: null, birthdate: ADULT_DOB, email: "civic-recovery@example.com", emailCanonical: "civic-recovery@example.com",
    });
    const limited = await w.services.authService.issue(userId, "recovery", "test");
    const res = await w.app.inject({
      method: "POST",
      url: "/v1/civic/devices",
      headers: bearer(limited.token),
      payload: { devicePubkey: newDevicePubkey() },
    });
    expect(res.statusCode).to.equal(403);
  });
});
