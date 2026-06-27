// Content-model + length enforcement for `post` (title required ≤200, body optional ≤2000), the
// [code-post-content-fields] alignment. The pure unit block exercises validateContent directly (no DB,
// like 15-jurisdiction); the integration block proves it is wired into BOTH the create and update paths
// of the RecordService. Caps come from the jurisdiction's contentLimits, else DEFAULT_CONTENT_LIMITS.
import { expect } from "chai";
import { validateContent } from "../src/index.js";
import { getWorld, rejects } from "./helpers/world.js";

const TITLE_MAX = 200;
const BODY_MAX = 2000;

describe("18 content validation: validateContent (post) — pure", () => {
  it("accepts a post with a title only (body optional)", () => {
    expect(() => validateContent("post", "create", { title: "A statement" })).to.not.throw();
  });

  it("accepts a post with a title and body", () => {
    expect(() => validateContent("post", "create", { title: "A statement", body: "the case" })).to.not.throw();
  });

  it("rejects a post with no title", () => {
    expect(() => validateContent("post", "create", { body: "orphan body" })).to.throw(/title is required/);
  });

  it("rejects a post whose title is empty or whitespace", () => {
    expect(() => validateContent("post", "create", { title: "" })).to.throw(/title is required/);
    expect(() => validateContent("post", "create", { title: "   " })).to.throw(/title is required/);
  });

  it("enforces the title length cap (200)", () => {
    expect(() => validateContent("post", "create", { title: "x".repeat(TITLE_MAX) })).to.not.throw();
    expect(() => validateContent("post", "create", { title: "x".repeat(TITLE_MAX + 1) })).to.throw(/title exceeds/);
  });

  it("enforces the body length cap (2000) when a body is present", () => {
    expect(() => validateContent("post", "create", { title: "ok", body: "y".repeat(BODY_MAX) })).to.not.throw();
    expect(() => validateContent("post", "create", { title: "ok", body: "y".repeat(BODY_MAX + 1) })).to.throw(/body exceeds/);
  });

  it("applies the same rules on update", () => {
    expect(() => validateContent("post", "update", { body: "no title" })).to.throw(/title is required/);
    expect(() => validateContent("post", "update", { title: "edited", body: "fine" })).to.not.throw();
  });

  it("skips a delete (it carries the DELETE_MARKER, not post content)", () => {
    expect(() => validateContent("post", "delete", { deleted: true })).to.not.throw();
  });

  it("does not constrain other record types here (e.g. comment)", () => {
    expect(() => validateContent("comment", "create", { body: "comments have no title" })).to.not.throw();
  });
});

describe("18 content validation: wired into RecordService create + update", () => {
  it("rejects a post create with no title", async () => {
    const { svc } = await getWorld();
    expect(await rejects(svc.create({ type: "post", author: "alice", content: { body: "no title" } }))).to.equal(true);
  });

  it("rejects a post create with an over-length title", async () => {
    const { svc } = await getWorld();
    expect(
      await rejects(svc.create({ type: "post", author: "alice", content: { title: "x".repeat(TITLE_MAX + 1) } })),
    ).to.equal(true);
  });

  it("accepts a valid post, then rejects an edit that violates the caps", async () => {
    const { svc } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { title: "Valid", body: "ok" } });
    expect(
      await rejects(svc.update({ entityId: post.entityId, author: "alice", content: { title: "x".repeat(TITLE_MAX + 1) } })),
    ).to.equal(true);
    expect(
      await rejects(svc.update({ entityId: post.entityId, author: "alice", content: { body: "no title on edit" } })),
    ).to.equal(true);
  });
});
