// [v1-media-accreditations] MediaAccreditationRepo + accreditationBodyIds on profile; mediaMark on feed authors.

import { expect } from "chai";
import { ServiceError } from "../src/errors.js";
import { makeAccount } from "./helpers/account.js";
import { resetWorld, type World } from "./helpers/world.js";

const BODY = "ab-leg-gallery";

describe("45 media-accreditation + Media mark wire", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
    await w.services.repos.accreditationBody.create(BODY, "Alberta Legislative Press Gallery");
  });

  it("grants accreditation and exposes accreditationBodyIds on public profile", async () => {
    const a = await makeAccount(w, { email: "reporter@example.com", handle: "@reporter" });
    await w.services.repos.profile.setVisibility(a.userId, "public");

    const before = await w.app.inject({ method: "GET", url: "/v1/public/profiles/reporter" });
    expect(before.statusCode).to.equal(200);
    expect(before.json()).to.not.have.property("mediaMark");
    expect(before.json().accreditationBodyIds).to.deep.equal([]);

    await w.services.repos.mediaAccreditation.grant({
      userId: a.userId,
      accreditationBodyId: BODY,
      grantedByAdminId: null,
    });

    const after = await w.app.inject({ method: "GET", url: "/v1/public/profiles/reporter" });
    expect(after.json()).to.not.have.property("mediaMark");
    expect(after.json().accreditationBodyIds).to.deep.equal([BODY]);
  });

  it("refuses grant against a retired body", async () => {
    const a = await makeAccount(w, { email: "r2@example.com" });
    await w.services.repos.accreditationBody.retire(BODY);
    try {
      await w.services.repos.mediaAccreditation.grant({
        userId: a.userId,
        accreditationBodyId: BODY,
        grantedByAdminId: null,
      });
      expect.fail("expected conflict");
    } catch (err) {
      expect(err).to.be.instanceOf(ServiceError);
      expect((err as ServiceError).code).to.equal("conflict");
    }
  });

  it("revoke drops mediaMark; listValidBodyIds respects expiry", async () => {
    const a = await makeAccount(w, { email: "r3@example.com", handle: "@reporter3" });
    await w.services.repos.profile.setVisibility(a.userId, "public");
    const row = await w.services.repos.mediaAccreditation.grant({
      userId: a.userId,
      accreditationBodyId: BODY,
      grantedByAdminId: null,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(await w.services.repos.mediaAccreditation.hasMediaMark(a.userId)).to.equal(true);
    await w.services.repos.mediaAccreditation.revoke(row.id);
    expect(await w.services.repos.mediaAccreditation.hasMediaMark(a.userId)).to.equal(false);

    const expired = await w.services.repos.mediaAccreditation.grant({
      userId: a.userId,
      accreditationBodyId: BODY,
      grantedByAdminId: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(expired.id).to.be.a("string");
    expect(await w.services.repos.mediaAccreditation.listValidBodyIds(a.userId)).to.deep.equal([]);
  });
});
