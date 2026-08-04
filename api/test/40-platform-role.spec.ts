// [v1-a-admin-role] PlatformRoleRepo: grant/revoke idempotency, countAdmins.

import { expect } from "chai";
import { makeAccount } from "./helpers/account.js";
import { resetWorld, type World } from "./helpers/world.js";

describe("40 platform-role repo", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("grants and revokes admin idempotently", async () => {
    const a = await makeAccount(w, { email: "admin-a@example.com" });
    const repo = w.services.repos.platformRole;

    expect(await repo.hasRole(a.userId, "admin")).to.equal(false);
    expect(await repo.countAdmins()).to.equal(0);

    await repo.grant(a.userId, "admin", null);
    await repo.grant(a.userId, "admin", a.userId); // idempotent — keeps original audit
    expect(await repo.hasRole(a.userId, "admin")).to.equal(true);
    expect(await repo.listRoles(a.userId)).to.deep.equal(["admin"]);
    expect(await repo.countAdmins()).to.equal(1);

    const admins = await repo.listAdmins();
    expect(admins).to.have.length(1);
    expect(admins[0]!.userId).to.equal(a.userId);
    expect(admins[0]!.grantedByAdminId).to.equal(null);

    await repo.revoke(a.userId, "admin");
    await repo.revoke(a.userId, "admin"); // idempotent no-op
    expect(await repo.hasRole(a.userId, "admin")).to.equal(false);
    expect(await repo.countAdmins()).to.equal(0);
  });

  it("countAdmins tracks multiple admins", async () => {
    const a = await makeAccount(w, { email: "a1@example.com" });
    const b = await makeAccount(w, { email: "a2@example.com" });
    const repo = w.services.repos.platformRole;
    await repo.grant(a.userId, "admin", null);
    await repo.grant(b.userId, "admin", a.userId);
    expect(await repo.countAdmins()).to.equal(2);
    await repo.revoke(a.userId, "admin");
    expect(await repo.countAdmins()).to.equal(1);
  });
});
