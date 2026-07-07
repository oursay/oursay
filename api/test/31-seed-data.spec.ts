import { expect } from "chai";
import { POST_TEMPLATES, seedUuid } from "../scripts/seed-data/content.js";
import { SEED_ANCHORS } from "../scripts/seed-data/people.js";

describe("31 seed data", () => {
  it("seedUuid is deterministic and UUID-shaped", () => {
    const a = seedUuid("ab-ravine");
    const b = seedUuid("ab-ravine");
    expect(a).to.equal(b);
    expect(a).to.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("exports authorless post templates and visibility anchors", () => {
    expect(POST_TEMPLATES.length).to.be.greaterThan(10);
    expect(SEED_ANCHORS.length).to.be.greaterThan(4);
    const scopes = new Set(POST_TEMPLATES.map((p) => p.scope));
    expect(scopes.has("alberta")).to.equal(true);
    expect(scopes.has("global")).to.equal(true);
    expect(scopes.has("generic")).to.equal(true);
    for (const root of POST_TEMPLATES) {
      expect(root.slug.length).to.be.greaterThan(0);
      expect(root.title.length).to.be.greaterThan(0);
    }
    const vis = new Set(SEED_ANCHORS.map((p) => p.visibility));
    expect(vis.has("public")).to.equal(true);
    expect(vis.has("my_district")).to.equal(true);
  });
});
