// [v1-a-admin-role] Session + public profile expose platformRoles after grant/revoke.

import { expect } from "chai";
import { fullSessionAccount, makeAccount } from "./helpers/account.js";
import { resetWorld, type World } from "./helpers/world.js";

describe("41 platform-role HTTP reads", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("GET /v1/auth/session includes platformRoles", async () => {
    const { userId, token } = await fullSessionAccount(w, "sess-admin@example.com", {
      handle: "@sessadmin",
    });
    const empty = await w.app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(empty.statusCode).to.equal(200);
    expect(empty.json().platformRoles).to.deep.equal([]);

    await w.services.repos.platformRole.grant(userId, "admin", null);
    const granted = await w.app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(granted.json().platformRoles).to.deep.equal(["admin"]);

    await w.services.repos.platformRole.revoke(userId, "admin");
    const revoked = await w.app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(revoked.json().platformRoles).to.deep.equal([]);
  });

  it("GET /v1/public/profiles/:handle includes platformRoles", async () => {
    const acct = await makeAccount(w, { handle: "@pubadmin", email: "pub-admin@example.com" });
    await w.services.repos.profile.setVisibility(acct.userId, "public");

    const before = await w.app.inject({
      method: "GET",
      url: "/v1/public/profiles/pubadmin",
    });
    expect(before.statusCode).to.equal(200, before.body);
    expect(before.json().platformRoles).to.deep.equal([]);

    await w.services.repos.platformRole.grant(acct.userId, "admin", null);
    const after = await w.app.inject({
      method: "GET",
      url: "/v1/public/profiles/pubadmin",
    });
    expect(after.json().platformRoles).to.deep.equal(["admin"]);
  });
});
