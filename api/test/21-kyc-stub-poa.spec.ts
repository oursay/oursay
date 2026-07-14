// Stub/dev KYC: Didit-mimic POA awards residency + private seed point without a prior profile address.

import { expect } from "chai";
import { hashRoundedPoint } from "../src/helpers/address.js";
import { DEV_STRATHCONA_POINT } from "../src/services/geocode/stub-provider.js";
import { fullSessionAccount } from "./helpers/account.js";
import { resetWorld, type World } from "./helpers/world.js";

describe("21 kyc stub poa: Didit-mimic residency + private point", () => {
  let w: World;

  beforeEach(async () => {
    w = await resetWorld();
  });

  it("POST /v1/dev/kyc/poa awards residency and stores stub seed point without profile address", async () => {
    const { userId, token } = await fullSessionAccount(w, "stub-poa@example.com");

    expect(await w.services.repos.geocode.getCurrent(userId)).to.equal(null);

    const res = await w.app.inject({
      method: "POST",
      url: "/v1/dev/kyc/poa",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).to.equal(200);
    expect(res.json()).to.deep.equal({ tier: "residency_verified" });

    const tier = await w.services.repos.kyc.latestTier(userId);
    expect(tier).to.equal("residency_verified");

    const geo = await w.services.repos.geocode.getCurrent(userId);
    expect(geo, "private point").to.not.equal(null);
    expect(geo!.provider).to.equal("stub");
    expect(geo!.lon).to.equal(DEV_STRATHCONA_POINT.lon);
    expect(geo!.lat).to.equal(DEV_STRATHCONA_POINT.lat);
    expect(geo!.addressHash).to.equal(
      hashRoundedPoint(DEV_STRATHCONA_POINT.lon, DEV_STRATHCONA_POINT.lat),
    );

    const profile = await w.db.pool.query(
      `SELECT address_line1, postal_code FROM auth.profiles WHERE user_id = $1`,
      [userId],
    );
    expect(profile.rows[0].address_line1).to.equal(null);
    expect(profile.rows[0].postal_code).to.equal(null);
  });

  it("second stub POA is idempotent for geocode (unchanged hash) and still returns residency", async () => {
    const { userId, token } = await fullSessionAccount(w, "stub-poa-dup@example.com");
    const headers = { authorization: `Bearer ${token}` };

    await w.app.inject({ method: "POST", url: "/v1/dev/kyc/poa", headers });
    const first = await w.services.repos.geocode.getCurrent(userId);

    const res = await w.app.inject({ method: "POST", url: "/v1/dev/kyc/poa", headers });
    expect(res.statusCode).to.equal(200);

    const second = await w.services.repos.geocode.getCurrent(userId);
    expect(second!.addressHash).to.equal(first!.addressHash);
    expect(await w.services.repos.geocode.historyForUser(userId)).to.have.length(1);
  });
});
