// Best-effort address geocoding + private point cache (auth.profile_geocodes / _geocode_history).
// Geocoding never blocks registration; the cached point is private (never on GET /v1/profile). CI uses
// the deterministic stub provider, which resolves a point ONLY from a valid Canadian postal code.

import { expect } from "chai";
import { hashAddress, normalizeAddress } from "../src/helpers/address.js";
import { codeFromLastMail, resetWorld, type World } from "./helpers/world.js";

const ADULT_DOB = "1990-06-15";

interface RegisterResult {
  userId: string;
  token: string;
}

let emailSeq = 0;

async function register(w: World, address: Record<string, unknown> | undefined): Promise<RegisterResult> {
  const email = `geo${emailSeq++}@example.com`;
  const reqRes = await w.app.inject({
    method: "POST",
    url: "/v1/auth/otp/request",
    payload: { email, purpose: "registration" },
  });
  expect(reqRes.statusCode).to.equal(202);
  const code = codeFromLastMail(w.mail, email);

  const res = await w.app.inject({
    method: "POST",
    url: "/v1/auth/otp/verify",
    payload: { email, code, profile: { birthdate: ADULT_DOB, ...(address ? { address } : {}) } },
  });
  expect(res.statusCode).to.equal(201);
  const body = res.json();
  return { userId: body.userId, token: body.session.token };
}

/** Recursively collect every object key in a JSON value (to assert no coordinate field leaks). */
function allKeys(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) allKeys(v, acc);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      acc.add(k);
      allKeys(v, acc);
    }
  }
  return acc;
}

describe("14 geocode: best-effort private point cache (current + append-only history)", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("geocodes a valid Canadian postal address on register and records history", async () => {
    const { userId } = await register(w, { province: "AB", postalCode: "t2p1h9", country: "ca" });

    const current = await w.services.repos.geocode.getCurrent(userId);
    expect(current, "current point").to.not.equal(null);
    expect(current!.provider).to.equal("stub");
    expect(current!.lon).to.be.a("number");
    expect(current!.lat).to.be.a("number");
    expect(current!.addressHash).to.equal(
      hashAddress(normalizeAddress({ province: "AB", postalCode: "t2p1h9", country: "ca" })),
    );

    const history = await w.services.repos.geocode.historyForUser(userId);
    expect(history).to.have.length(1);
    expect(history[0].addressHash).to.equal(current!.addressHash);
  });

  it("registers (201) with no point when an attempt-eligible address is unresolvable", async () => {
    // line1+city+province clears the attempt gate, but the stub resolves only from a postal code → null.
    const { userId } = await register(w, { line1: "123 Fake St", city: "Calgary", province: "AB", country: "CA" });

    expect(await w.services.repos.geocode.getCurrent(userId)).to.equal(null);
    expect(await w.services.repos.geocode.historyForUser(userId)).to.have.length(0);
  });

  it("does not attempt geocoding below the gate (insufficient address)", async () => {
    const { userId } = await register(w, { city: "Edmonton" }); // no postal, no line1+province

    expect(await w.services.repos.geocode.getCurrent(userId)).to.equal(null);
    expect(await w.services.repos.geocode.historyForUser(userId)).to.have.length(0);
  });

  it("does not attempt geocoding for a non-Canadian address", async () => {
    const { userId } = await register(w, {
      line1: "1600 Pennsylvania Ave",
      city: "Washington",
      province: "DC",
      postalCode: "20500",
      country: "US",
    });

    expect(await w.services.repos.geocode.getCurrent(userId)).to.equal(null);
    expect(await w.services.repos.geocode.historyForUser(userId)).to.have.length(0);
  });

  it("appends history and updates current when the address changes", async () => {
    const { userId } = await register(w, { province: "AB", postalCode: "t2p1h9", country: "ca" });
    const a = await w.services.repos.geocode.getCurrent(userId);
    expect(a).to.not.equal(null);

    // Re-syncing the unchanged address is a no-op (hash matches the current row).
    const noop = await w.services.geocodeService.syncGeocodeForUser(userId);
    expect(noop.status).to.equal("unchanged");
    expect(await w.services.repos.geocode.historyForUser(userId)).to.have.length(1);

    // Move to a different resolvable CA address, then re-geocode from the stored profile.
    await w.db.pool.query(`UPDATE auth.profiles SET postal_code = $2, province = $3 WHERE user_id = $1`, [
      userId,
      "T5J 0N3",
      "AB",
    ]);
    const result = await w.services.geocodeService.syncGeocodeForUser(userId);
    expect(result.status).to.equal("geocoded");

    const b = await w.services.repos.geocode.getCurrent(userId);
    expect(b!.addressHash).to.not.equal(a!.addressHash);
    expect([b!.lon, b!.lat]).to.not.deep.equal([a!.lon, a!.lat]);

    const history = await w.services.repos.geocode.historyForUser(userId);
    expect(history).to.have.length(2);
    expect(new Set(history.map((h) => h.addressHash))).to.deep.equal(new Set([a!.addressHash, b!.addressHash]));
  });

  it("clears the current point but keeps history when the address drops below the gate", async () => {
    const { userId } = await register(w, { province: "AB", postalCode: "t2p1h9", country: "ca" });
    const a = await w.services.repos.geocode.getCurrent(userId);
    expect(a).to.not.equal(null);

    await w.db.pool.query(
      `UPDATE auth.profiles SET postal_code = NULL, address_line1 = NULL, city = NULL, province = NULL WHERE user_id = $1`,
      [userId],
    );
    const result = await w.services.geocodeService.syncGeocodeForUser(userId);
    expect(result.status).to.equal("cleared");

    expect(await w.services.repos.geocode.getCurrent(userId)).to.equal(null);
    const history = await w.services.repos.geocode.historyForUser(userId);
    expect(history).to.have.length(1);
    expect(history[0].addressHash).to.equal(a!.addressHash);
  });

  it("keeps the last-known-good current point when a re-geocode fails", async () => {
    const { userId } = await register(w, { province: "AB", postalCode: "t2p1h9", country: "ca" });
    const a = await w.services.repos.geocode.getCurrent(userId);

    // Change to an attempt-eligible but unresolvable address (no postal) — the stub returns null.
    await w.db.pool.query(
      `UPDATE auth.profiles SET postal_code = NULL, address_line1 = $2, city = $3, province = $4 WHERE user_id = $1`,
      [userId, "123 Fake St", "Calgary", "AB"],
    );
    const result = await w.services.geocodeService.syncGeocodeForUser(userId);
    expect(result.status).to.equal("unresolved");

    const after = await w.services.repos.geocode.getCurrent(userId);
    expect(after, "current preserved").to.not.equal(null);
    expect(after!.addressHash).to.equal(a!.addressHash);
    expect(await w.services.repos.geocode.historyForUser(userId)).to.have.length(1);
  });

  it("never exposes coordinates on GET /v1/profile", async () => {
    const { token } = await register(w, { province: "AB", postalCode: "t2p1h9", country: "ca" });

    const res = await w.app.inject({
      method: "GET",
      url: "/v1/profile",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).to.equal(200);
    const keys = allKeys(res.json());
    for (const forbidden of ["lat", "lon", "lng", "geom", "coordinates", "confidence", "addressHash"]) {
      expect(keys.has(forbidden), `profile must not expose '${forbidden}'`).to.equal(false);
    }
  });
});
