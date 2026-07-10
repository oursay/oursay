// Official seat claims — roster seat ↔ membership role (platform-only).

import { expect } from "chai";
import { ingestOfficialSeats, paths } from "@oursay/geo";
import { ServiceError } from "../src/errors.js";
import { makeAccount } from "./helpers/account.js";
import { resetWorld, type World } from "./helpers/world.js";

const AB = "ab-ca-gov";

async function ingestAbSeats(w: World): Promise<void> {
  await ingestOfficialSeats(
    w.services.geoStore,
    { jurisdictionId: AB, effectiveDate: "2019-04-16", boundaryYear: 2019 },
    paths.repoRoot,
  );
}

describe("36 official seat claim", () => {
  let w: World;

  beforeEach(async () => {
    w = await resetWorld();
    await ingestAbSeats(w);
  });

  it("claimSeat links ab-edm_strth to the user and assigns official role", async () => {
    const author = await makeAccount(w, {
      handle: "rae_nguyen",
      displayName: "Rae Nguyen",
    });
    await w.services.repos.profile.setVisibility(author.userId, "public");
    await w.services.repos.membership.add(author.userId, AB);

    await w.services.officialSeatClaimService.claimSeat(author.userId, "ab-edm_strth");

    const seat = await w.services.geoStore.getOfficialSeatByHandle("ab-edm_strth");
    expect(seat?.claimedUserHandle).to.equal("rae_nguyen");

    const membership = await w.services.repos.membership.get(author.userId, AB);
    expect(membership?.role).to.equal("official");
    expect(membership?.representedDistrictSlug).to.equal("edmonton-strathcona");

    const res = await w.app.inject({
      method: "GET",
      url: "/v1/public/profiles/rae_nguyen",
    });
    expect(res.statusCode).to.equal(200, res.body);
    const body = res.json() as { role: string; official: boolean };
    expect(body.official).to.equal(true);
    expect(body.role).to.equal("MLA · Edmonton-Strathcona");
  });

  it("rejects claiming a seat already held by another user", async () => {
    const first = await makeAccount(w, { handle: "rae_nguyen" });
    const second = await makeAccount(w, { handle: "other_mla" });
    await w.services.officialSeatClaimService.claimSeat(first.userId, "ab-edm_strth");

    try {
      await w.services.officialSeatClaimService.claimSeat(second.userId, "ab-edm_strth");
      expect.fail("expected conflict");
    } catch (e: unknown) {
      expect(e).to.be.instanceOf(ServiceError);
      expect((e as ServiceError).code).to.equal("conflict");
    }
  });
});
