// [v1-media-accreditation-bodies] AccreditationBodyRepo: create/update/retire/activate + id validation.

import { expect } from "chai";
import { ServiceError } from "../src/errors.js";
import {
  assertAccreditationBodyId,
  assertAccreditationBodyName,
} from "../src/repo/accreditation-body.repo.js";
import { resetWorld, type World } from "./helpers/world.js";

describe("43 accreditation-body repo", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("validates catalog ids and names", () => {
    expect(assertAccreditationBodyId("ca-caj-example")).to.equal("ca-caj-example");
    expect(() => assertAccreditationBodyId("CA-CAJ")).to.throw(ServiceError);
    expect(() => assertAccreditationBodyId("-bad")).to.throw(ServiceError);
    expect(assertAccreditationBodyName("  Canadian Association of Journalists  ")).to.equal(
      "Canadian Association of Journalists",
    );
    expect(() => assertAccreditationBodyName("   ")).to.throw(ServiceError);
  });

  it("creates, lists, renames, retires, and reactivates", async () => {
    const repo = w.services.repos.accreditationBody;

    const created = await repo.create("ca-caj-example", "Canadian Association of Journalists");
    expect(created.id).to.equal("ca-caj-example");
    expect(created.status).to.equal("active");

    expect(await repo.list()).to.have.length(1);
    expect(await repo.list("retired")).to.have.length(0);

    const renamed = await repo.updateName("ca-caj-example", "CAJ");
    expect(renamed.name).to.equal("CAJ");

    const retired = await repo.retire("ca-caj-example");
    expect(retired.status).to.equal("retired");
    expect(await repo.list()).to.have.length(0);
    expect(await repo.list("retired")).to.have.length(1);
    expect(await repo.list("all")).to.have.length(1);

    // Idempotent retire
    await repo.retire("ca-caj-example");

    const active = await repo.activate("ca-caj-example");
    expect(active.status).to.equal("active");
    expect(await repo.list()).to.have.length(1);
  });

  it("refuses duplicate create and missing update/retire", async () => {
    const repo = w.services.repos.accreditationBody;
    await repo.create("ca-leg-gallery", "Legislative Assembly Press Gallery");

    try {
      await repo.create("ca-leg-gallery", "Duplicate");
      expect.fail("expected conflict");
    } catch (err) {
      expect(err).to.be.instanceOf(ServiceError);
      expect((err as ServiceError).code).to.equal("conflict");
    }

    try {
      await repo.updateName("missing-body", "Nope");
      expect.fail("expected not_found");
    } catch (err) {
      expect(err).to.be.instanceOf(ServiceError);
      expect((err as ServiceError).code).to.equal("not_found");
    }

    try {
      await repo.retire("missing-body");
      expect.fail("expected not_found");
    } catch (err) {
      expect(err).to.be.instanceOf(ServiceError);
      expect((err as ServiceError).code).to.equal("not_found");
    }
  });
});
