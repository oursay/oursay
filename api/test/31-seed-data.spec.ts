import { expect } from "chai";
import { POST_TEMPLATES, seedUuid, SHOWCASE_BINDINGS } from "../scripts/seed-data/content.js";
import { SEED_ANCHORS } from "../scripts/seed-data/people.js";
import { pickSeedComment } from "../scripts/seed-orchestrator.js";

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
    expect(SHOWCASE_BINDINGS.length).to.be.greaterThan(3);
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

  describe("pickSeedComment", () => {
    const rng = () => 0; // deterministic: always picks the first available option

    it("consumes each thread-specific comment at most once, then falls back to generic", () => {
      const used = new Map<string, Set<number>>();
      const specific = ["alpha", "beta"];
      const first = pickSeedComment(rng, "slug-a", specific, used);
      const second = pickSeedComment(rng, "slug-a", specific, used);
      expect([first, second]).to.have.members(["alpha", "beta"]);
      expect(first).to.not.equal(second); // no repeat within a thread
      // Both specifics consumed → next pick must be a generic (not one of the specifics).
      const third = pickSeedComment(rng, "slug-a", specific, used);
      expect(specific).to.not.include(third);
      expect(used.get("slug-a")!.size).to.equal(2);
    });

    it("tracks usage per thread slug independently", () => {
      const used = new Map<string, Set<number>>();
      const specific = ["alpha", "beta"];
      pickSeedComment(rng, "slug-a", specific, used);
      // A different slug starts fresh — first specific is available again.
      expect(pickSeedComment(rng, "slug-b", specific, used)).to.equal("alpha");
    });

    it("falls back to a generic comment when a thread has no specific comments", () => {
      const used = new Map<string, Set<number>>();
      const body = pickSeedComment(rng, "slug-c", undefined, used);
      expect(body).to.be.a("string").with.length.greaterThan(0);
      expect(used.has("slug-c")).to.equal(false);
    });
  });
});
