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

  it("does not constrain a post's title field on other types (comment has no title)", () => {
    expect(() => validateContent("comment", "create", { body: "comments have no title" })).to.not.throw();
  });
});

const COMMENT_BODY_MAX = 2000;
const PETITION_TITLE_MAX = 200;
const PETITION_TEXT_MAX = 5000;
const POLL_QUESTION_MAX = 200;
const POLL_OPTION_MAX = 100;
const POLL_MAX_OPTIONS = 10;
const POLL_DESCRIPTION_MAX = 2000;

describe("18 content validation: validateContent (comment) — pure", () => {
  it("accepts a comment with a body", () => {
    expect(() => validateContent("comment", "create", { body: "a reply" })).to.not.throw();
  });

  it("rejects a comment with no body / empty / whitespace", () => {
    expect(() => validateContent("comment", "create", {})).to.throw(/comment.body is required/);
    expect(() => validateContent("comment", "create", { body: "" })).to.throw(/comment.body is required/);
    expect(() => validateContent("comment", "create", { body: "   " })).to.throw(/comment.body is required/);
  });

  it("enforces the body length cap (2000)", () => {
    expect(() => validateContent("comment", "create", { body: "z".repeat(COMMENT_BODY_MAX) })).to.not.throw();
    expect(() => validateContent("comment", "create", { body: "z".repeat(COMMENT_BODY_MAX + 1) })).to.throw(/comment.body exceeds/);
  });
});

describe("18 content validation: validateContent (petition) — pure", () => {
  it("accepts a petition with a title and text", () => {
    expect(() => validateContent("petition", "create", { title: "Repave", text: "please" })).to.not.throw();
  });

  it("rejects a petition with no title (empty/whitespace)", () => {
    expect(() => validateContent("petition", "create", { text: "orphan" })).to.throw(/petition.title is required/);
    expect(() => validateContent("petition", "create", { title: "   ", text: "x" })).to.throw(/petition.title is required/);
  });

  it("rejects a petition with no text (empty/whitespace)", () => {
    expect(() => validateContent("petition", "create", { title: "Repave" })).to.throw(/petition.text is required/);
    expect(() => validateContent("petition", "create", { title: "Repave", text: "   " })).to.throw(/petition.text is required/);
  });

  it("enforces the title (200) and text (5000) caps", () => {
    expect(() => validateContent("petition", "create", { title: "t".repeat(PETITION_TITLE_MAX + 1), text: "x" })).to.throw(/petition.title exceeds/);
    expect(() => validateContent("petition", "create", { title: "t", text: "x".repeat(PETITION_TEXT_MAX + 1) })).to.throw(/petition.text exceeds/);
    expect(() => validateContent("petition", "create", { title: "t".repeat(PETITION_TITLE_MAX), text: "x".repeat(PETITION_TEXT_MAX) })).to.not.throw();
  });

  it("does not touch rules (EntityRules embedding stays valid)", () => {
    expect(() => validateContent("petition", "create", { title: "t", text: "x", rules: { allowRevoke: true } })).to.not.throw();
  });
});

describe("18 content validation: validateContent (poll) — pure", () => {
  it("accepts a poll with a question and options", () => {
    expect(() => validateContent("poll", "create", { question: "Build it?", options: ["yes", "no"] })).to.not.throw();
  });

  it("rejects a poll with no question (empty/whitespace)", () => {
    expect(() => validateContent("poll", "create", { options: ["yes"] })).to.throw(/poll.question is required/);
    expect(() => validateContent("poll", "create", { question: "  ", options: ["yes"] })).to.throw(/poll.question is required/);
  });

  it("requires options to be a non-empty array", () => {
    expect(() => validateContent("poll", "create", { question: "q?" })).to.throw(/poll.options must be a non-empty array/);
    expect(() => validateContent("poll", "create", { question: "q?", options: [] })).to.throw(/poll.options must be a non-empty array/);
    expect(() => validateContent("poll", "create", { question: "q?", options: "yes" })).to.throw(/poll.options must be a non-empty array/);
  });

  it("rejects more than maxOptions (10)", () => {
    const tooMany = Array.from({ length: POLL_MAX_OPTIONS + 1 }, (_, i) => `opt${i}`);
    expect(() => validateContent("poll", "create", { question: "q?", options: tooMany })).to.throw(/more than 10 options/);
    const exactly = Array.from({ length: POLL_MAX_OPTIONS }, (_, i) => `opt${i}`);
    expect(() => validateContent("poll", "create", { question: "q?", options: exactly })).to.not.throw();
  });

  it("rejects a non-string option element", () => {
    expect(() => validateContent("poll", "create", { question: "q?", options: ["yes", 42] })).to.throw(/poll.options\[1\] must be a string/);
  });

  it("enforces the per-option length cap (100)", () => {
    expect(() => validateContent("poll", "create", { question: "q?", options: ["o".repeat(POLL_OPTION_MAX)] })).to.not.throw();
    expect(() => validateContent("poll", "create", { question: "q?", options: ["o".repeat(POLL_OPTION_MAX + 1)] })).to.throw(/poll.options\[0\] exceeds/);
  });

  it("enforces the description cap (2000) only when present", () => {
    expect(() => validateContent("poll", "create", { question: "q?", options: ["yes"] })).to.not.throw();
    expect(() => validateContent("poll", "create", { question: "q?", options: ["yes"], description: "d".repeat(POLL_DESCRIPTION_MAX) })).to.not.throw();
    expect(() => validateContent("poll", "create", { question: "q?", options: ["yes"], description: "d".repeat(POLL_DESCRIPTION_MAX + 1) })).to.throw(/poll.description exceeds/);
  });

  it("applies the same rules on update", () => {
    expect(() => validateContent("poll", "update", { question: "q?", options: [] })).to.throw(/poll.options must be a non-empty array/);
    expect(() => validateContent("poll", "update", { question: "q?", options: ["yes", "no"] })).to.not.throw();
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

  it("rejects a comment create with no body", async () => {
    const { svc } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { title: "Host" } });
    expect(
      await rejects(svc.create({ type: "comment", author: "bob", content: {}, parent: { type: "post", id: post.entityId } })),
    ).to.equal(true);
  });

  it("rejects a petition create with no text", async () => {
    const { svc } = await getWorld();
    expect(await rejects(svc.create({ type: "petition", author: "alice", content: { title: "t" } }))).to.equal(true);
  });

  it("rejects a poll create with too many options", async () => {
    const { svc } = await getWorld();
    const options = Array.from({ length: 11 }, (_, i) => `opt${i}`);
    expect(await rejects(svc.create({ type: "poll", author: "alice", content: { question: "q?", options } }))).to.equal(true);
  });
});
