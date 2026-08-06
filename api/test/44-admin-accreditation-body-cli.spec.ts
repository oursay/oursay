// [v1-media-accreditation-bodies] CLI smoke: usage / refuse without args (mirrors admin-role).

import { expect } from "chai";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resetWorld, type World } from "./helpers/world.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("44 admin-accreditation-body CLI smoke", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("repo create/list mirrors CLI catalog semantics", async () => {
    const repo = w.services.repos.accreditationBody;
    await repo.create("ab-leg-gallery", "Alberta Legislative Press Gallery");
    const listed = await repo.list("active");
    expect(listed.map((b) => b.id)).to.deep.equal(["ab-leg-gallery"]);
    await repo.retire("ab-leg-gallery");
    expect(await repo.list("active")).to.have.length(0);
    expect((await repo.getById("ab-leg-gallery"))?.status).to.equal("retired");
  });

  it("admin-accreditation-body script prints usage when invoked with no args", function () {
    const help = spawnSync(
      "npx",
      ["tsx", "scripts/admin-accreditation-body.ts"],
      { cwd: packageRoot, encoding: "utf8", shell: true, env: { ...process.env, NODE_ENV: "development" } },
    );
    expect(help.status).to.equal(2);
    expect(help.stderr + help.stdout).to.match(/usage: admin-accreditation-body/);
  });
});
