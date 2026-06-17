import { expect } from "chai";
import { getWorld, rejects } from "./helpers/world.js";

/** Attachment rules: which child types may attach to which parents, and comment depth ≤ 3. */
describe("02 attach: parent rules + comment depth", () => {
  it("allows comments on post/petition/poll and nested comments; reactions on post/comment", async () => {
    const { svc } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { body: "p" } });
    const petition = await svc.create({
      type: "petition",
      author: "alice",
      content: { title: "t", text: "x" },
    });
    const poll = await svc.create({
      type: "poll",
      author: "alice",
      content: { question: "q?", options: ["yes", "no"] },
    });

    const c1 = await svc.create({ type: "comment", author: "bob", content: { body: "c1" }, parent: { type: "post", id: post.entityId } });
    await svc.create({ type: "comment", author: "bob", content: { body: "on petition" }, parent: { type: "petition", id: petition.entityId } });
    await svc.create({ type: "comment", author: "bob", content: { body: "on poll" }, parent: { type: "poll", id: poll.entityId } });
    await svc.create({ type: "comment", author: "carol", content: { body: "reply" }, parent: { type: "comment", id: c1.entityId } });

    await svc.react("bob", { type: "post", id: post.entityId }, "check");
    await svc.react("bob", { type: "comment", id: c1.entityId }, "cross");
    await svc.sign("carol", petition.entityId);
    await svc.vote("carol", poll.entityId, "yes");
  });

  it("rejects reactions on petitions/polls, signatures on non-petitions, votes on non-polls", async () => {
    const { svc } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { body: "p" } });
    const petition = await svc.create({ type: "petition", author: "alice", content: { title: "t", text: "x" } });
    const poll = await svc.create({ type: "poll", author: "alice", content: { question: "q?", options: ["yes"] } });

    expect(await rejects(svc.react("bob", { type: "petition", id: petition.entityId }, "check"))).to.equal(true);
    expect(await rejects(svc.react("bob", { type: "poll", id: poll.entityId }, "check"))).to.equal(true);
    expect(await rejects(svc.create({ type: "petition_signature", author: "bob", content: {}, parent: { type: "post", id: post.entityId } }))).to.equal(true);
    expect(await rejects(svc.create({ type: "vote", author: "bob", content: { option: "yes" }, parent: { type: "post", id: post.entityId } }))).to.equal(true);
  });

  it("allows comment depth 3 but rejects depth 4", async () => {
    const { svc } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { body: "root" } });
    const c1 = await svc.create({ type: "comment", author: "a", content: { body: "d1" }, parent: { type: "post", id: post.entityId } });
    const c2 = await svc.create({ type: "comment", author: "a", content: { body: "d2" }, parent: { type: "comment", id: c1.entityId } });
    const c3 = await svc.create({ type: "comment", author: "a", content: { body: "d3" }, parent: { type: "comment", id: c2.entityId } });
    // 4th level must be rejected.
    expect(await rejects(svc.create({ type: "comment", author: "a", content: { body: "d4" }, parent: { type: "comment", id: c3.entityId } }))).to.equal(true);
  });

  it("enforces one active vote / signature per author per parent", async () => {
    const { svc } = await getWorld();
    const poll = await svc.create({ type: "poll", author: "alice", content: { question: "q?", options: ["yes", "no"] } });
    const petition = await svc.create({ type: "petition", author: "alice", content: { title: "t", text: "x" } });
    await svc.vote("bob", poll.entityId, "yes");
    await svc.sign("bob", petition.entityId);
    expect(await rejects(svc.vote("bob", poll.entityId, "no")), "second vote rejected").to.equal(true);
    expect(await rejects(svc.sign("bob", petition.entityId)), "second signature rejected").to.equal(true);
  });
});
