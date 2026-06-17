import { expect } from "chai";
import { getWorld, isoFromNow, rejects } from "./helpers/world.js";

/** Per-entity governance: vote changes and signature revocations are FINAL by default, and
 *  only allowed when the entity's rules + deadline permit. Platform can update the rules. */
describe("04 governance: vote change / signature revoke gating + platform rules update", () => {
  it("allows changing a vote when the poll permits it before the deadline", async () => {
    const { svc, store } = await getWorld();
    const poll = await svc.create({
      type: "poll",
      author: "alice",
      content: { question: "q?", options: ["yes", "no"], rules: { allowChange: true, deadline: isoFromNow(60_000) } },
    });
    await svc.vote("bob", poll.entityId, "yes");
    await svc.changeVote("bob", poll.entityId, "no");

    const results = await store.getPollResults(poll.entityId);
    expect(results).to.deep.equal([{ option: "no", count: 1 }]); // latest vote wins, counted once
  });

  it("rejects a vote change when the poll is final (default) or past its deadline", async () => {
    const { svc } = await getWorld();
    const final = await svc.create({ type: "poll", author: "alice", content: { question: "q?", options: ["yes", "no"] } });
    await svc.vote("bob", final.entityId, "yes");
    expect(await rejects(svc.changeVote("bob", final.entityId, "no")), "final poll").to.equal(true);

    const expired = await svc.create({
      type: "poll",
      author: "alice",
      content: { question: "q?", options: ["yes", "no"], rules: { allowChange: true, deadline: isoFromNow(-1000) } },
    });
    await svc.vote("carol", expired.entityId, "yes");
    expect(await rejects(svc.changeVote("carol", expired.entityId, "no")), "past deadline").to.equal(true);
  });

  it("gates signature revocation the same way", async () => {
    const { svc, store } = await getWorld();
    const revocable = await svc.create({
      type: "petition",
      author: "alice",
      content: { title: "t", text: "x", rules: { allowRevoke: true, deadline: isoFromNow(60_000) } },
    });
    await svc.sign("bob", revocable.entityId);
    await svc.revoke("bob", revocable.entityId);
    expect(await store.getPetitionSignatureCount(revocable.entityId)).to.equal(0);

    const final = await svc.create({ type: "petition", author: "alice", content: { title: "t", text: "x" } });
    await svc.sign("carol", final.entityId);
    expect(await rejects(svc.revoke("carol", final.entityId)), "final petition").to.equal(true);
    expect(await store.getPetitionSignatureCount(final.entityId)).to.equal(1);
  });

  it("a platform-signed rules update flips a previously-forbidden vote change to allowed", async () => {
    const { svc, store } = await getWorld();
    const poll = await svc.create({ type: "poll", author: "alice", content: { question: "q?", options: ["yes", "no"] } });
    await svc.vote("bob", poll.entityId, "yes");
    expect(await rejects(svc.changeVote("bob", poll.entityId, "no")), "forbidden before rules update").to.equal(true);

    await svc.updateRules(poll.entityId, { allowChange: true, deadline: isoFromNow(60_000) });
    await svc.changeVote("bob", poll.entityId, "no");
    expect(await store.getPollResults(poll.entityId)).to.deep.equal([{ option: "no", count: 1 }]);
  });
});
