// users.handle must be canonical wire form (no @) at the repo and DB layers.

import { expect } from "chai";
import { randomUUID } from "node:crypto";
import { resetWorld, type World } from "./helpers/world.js";

describe("30 user handle: repo + DB format enforcement", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("rejects invalid characters at the repo layer", async () => {
    try {
      await w.services.repos.user.create({ id: randomUUID(), handle: "jane.alberta" });
      expect.fail("expected create to throw");
    } catch (e) {
      expect((e as Error).message).to.match(/Invalid handle/);
    }
  });

  it("rejects handles that are too long at the repo layer", async () => {
    const long = "a".repeat(31);
    try {
      await w.services.repos.user.create({ id: randomUUID(), handle: long });
      expect.fail("expected create to throw");
    } catch (e) {
      expect((e as Error).message).to.match(/Invalid handle/);
    }
  });

  it("stores wire form and strips a leading @ on input", async () => {
    const id = randomUUID();
    await w.services.repos.user.create({ id, handle: "@weichen", displayName: "Wei Chen" });
    const user = await w.services.repos.user.getById(id);
    expect(user?.handle).to.equal("weichen");
  });

  it("accepts hyphens in wire handles", async () => {
    const id = randomUUID();
    await w.services.repos.user.create({ id, handle: "jane-alberta" });
    expect((await w.services.repos.user.getById(id))?.handle).to.equal("jane-alberta");
  });

  it("looks up by wire or @-prefixed handle", async () => {
    const id = randomUUID();
    await w.services.repos.user.create({ id, handle: "premier" });
    expect((await w.services.repos.user.getByHandle("premier"))?.id).to.equal(id);
    expect((await w.services.repos.user.getByHandle("@premier"))?.id).to.equal(id);
  });
});
