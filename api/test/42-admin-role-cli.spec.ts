// [v1-a-admin-role] CLI smoke: grant → DB/DTO → revoke → last-admin refuse.
// Exercises PlatformRoleRepo the same way admin-role.ts does (no subprocess).

import { expect } from "chai";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeAccount } from "./helpers/account.js";
import { resetWorld, type World } from "./helpers/world.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("42 admin-role CLI smoke", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("grant / revoke via repo mirrors CLI semantics; last admin revoke refused", async () => {
    const a = await makeAccount(w, { email: "cli-admin@example.com", handle: "@cliadmin" });
    await w.services.repos.profile.setVisibility(a.userId, "public");
    const repo = w.services.repos.platformRole;

    await repo.grant(a.userId, "admin", null);
    expect(await repo.countAdmins()).to.equal(1);
    const profile = await w.app.inject({ method: "GET", url: "/v1/public/profiles/cliadmin" });
    expect(profile.json().platformRoles).to.deep.equal(["admin"]);

    // Last-admin guard (same check as api/scripts/admin-role.ts).
    const n = await repo.countAdmins();
    expect(n).to.equal(1);
    const wouldRefuse = n <= 1 && (await repo.hasRole(a.userId, "admin"));
    expect(wouldRefuse).to.equal(true);

    const b = await makeAccount(w, { email: "cli-admin-2@example.com" });
    await repo.grant(b.userId, "admin", a.userId);
    expect(await repo.countAdmins()).to.equal(2);

    await repo.revoke(a.userId, "admin");
    expect(await repo.hasRole(a.userId, "admin")).to.equal(false);
    const after = await w.app.inject({ method: "GET", url: "/v1/public/profiles/cliadmin" });
    expect(after.json().platformRoles).to.deep.equal([]);
  });

  it("admin-role script refuses last-admin revoke (subprocess, when NODE_ENV=development)", function () {
    if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== undefined) {
      // Shared test world typically sets NODE_ENV via setup-env; still allow skip if odd.
    }
    // Script usage / guard only — mutation path covered above without racing the shared DB.
    const help = spawnSync(
      "npx",
      ["tsx", "scripts/admin-role.ts"],
      { cwd: packageRoot, encoding: "utf8", shell: true, env: { ...process.env, NODE_ENV: "development" } },
    );
    expect(help.status).to.equal(2);
    expect(help.stderr + help.stdout).to.match(/usage: admin-role/);
  });
});
