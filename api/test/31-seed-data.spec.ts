import { expect } from "chai";
import { seedUuid } from "../scripts/seed-data/corpus.js";
import { SEED_PEOPLE } from "../scripts/seed-data/people.js";
import { SEED_ROOTS } from "../scripts/seed-data/corpus.js";

describe("31 seed data", () => {
  it("seedUuid is deterministic and UUID-shaped", () => {
    const a = seedUuid("stmt-hana-ravine");
    const b = seedUuid("stmt-hana-ravine");
    expect(a).to.equal(b);
    expect(a).to.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("exports a story-sized people set and root corpus", () => {
    expect(SEED_PEOPLE.length).to.be.greaterThan(10);
    expect(SEED_ROOTS.length).to.be.greaterThan(10);
    for (const root of SEED_ROOTS) {
      expect(root.id).to.equal(seedUuid(root.slug));
    }
  });
});
