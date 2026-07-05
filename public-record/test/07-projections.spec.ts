import { expect } from "chai";
import { getThread } from "../src/projection.js";
import { getWorld } from "./helpers/world.js";

/** Fold-on-read projections: assemble a thread, tally a poll, count signatures. */
describe("07 projections: getThread, poll results, signature counts", () => {
  it("assembles a post thread with nested comments and reaction tallies", async () => {
    const { svc, store } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { title: "Test post", body: "thread root" } });
    const c1 = await svc.create({ type: "comment", author: "bob", content: { body: "top comment" }, parent: { type: "post", id: post.entityId } });
    await svc.create({ type: "comment", author: "carol", content: { body: "reply" }, parent: { type: "comment", id: c1.entityId } });
    await svc.react("bob", { type: "post", id: post.entityId }, "check");
    await svc.react("carol", { type: "post", id: post.entityId }, "check");

    const thread = await getThread(store, post.entityId);
    expect(thread!.root.type).to.equal("post");
    expect(thread!.reactionsByEntity).to.deep.equal([{ kind: "check", count: 2 }]);
    expect(thread!.comments).to.have.length(1);
    expect(thread!.comments[0].state.entityId).to.equal(c1.entityId);
    expect(thread!.comments[0].replies).to.have.length(1);
  });

  it("tallies poll results by option", async () => {
    const { svc, store } = await getWorld();
    const poll = await svc.create({ type: "poll", author: "alice", content: { question: "q?", options: ["yes", "no"] } });
    await svc.vote("bob", poll.entityId, "yes");
    await svc.vote("carol", poll.entityId, "yes");
    await svc.vote("dave", poll.entityId, "no");

    const results = await store.getPollResults(poll.entityId);
    expect(results).to.deep.include.members([
      { option: "yes", count: 2 },
      { option: "no", count: 1 },
    ]);
  });

  it("counts active petition signatures", async () => {
    const { svc, store } = await getWorld();
    const petition = await svc.create({
      type: "petition",
      author: "alice",
      content: { title: "t", text: "x", rules: { allowRevoke: true, deadline: new Date(Date.now() + 60_000).toISOString() } },
    });
    await svc.sign("bob", petition.entityId);
    await svc.sign("carol", petition.entityId);
    await svc.sign("dave", petition.entityId);
    await svc.revoke("dave", petition.entityId);

    expect(await store.getPetitionSignatureCount(petition.entityId)).to.equal(2);
  });
});
