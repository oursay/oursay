// [align-w4-api-surface] P2/P3 — the viewer-aware, kind-agnostic record detail + comment thread.
// Seeds entities via the dev-path RecordService, links authors/participants to accounts via
// thread-key bindings (what a real join writes), and asserts the web-app `getRecordDetail` contract
// on the wire: `{ detail, comments }` with per-node identity resolution, nested comments (depth ≤ 3),
// interlinks by id, count-exposure policy on scalars, viewer `_my`/`_vote` through the viewer's OWN
// persona keys, and 404-not-403 for a missing/deleted/non-root id.

import { expect } from "chai";
import { randomUUID } from "node:crypto";
import { PublicChain, RecordService } from "@oursay/public-record";
import { makeAccount } from "./helpers/account.js";
import { resetWorld, type World } from "./helpers/world.js";

function seeder(w: World): RecordService {
  return new RecordService(new PublicChain(w.services.recordStore, randomUUID()), w.services.recordStore);
}

/** Link a dev-path pubkey to an account for one thread (what a real join writes). Pubkeys are globally
 *  unique, so a distinct pubkey is used per (account, thread). */
async function link(w: World, pubkey: string, userId: string, threadId: string, jurisdiction = "oursay-global") {
  await w.services.recordStore.registerThreadBinding({
    threadPubkey: pubkey,
    userId,
    threadId,
    jurisdiction,
    commitment: `c-${pubkey}`,
    bindingSig: `sig-${pubkey}`,
  });
}

async function detail(w: World, id: string, token?: string) {
  const res = await w.app.inject({
    method: "GET",
    url: `/v1/public/records/${id}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  expect(res.statusCode).to.equal(200, res.body);
  return res.json() as { detail: any; comments: any[] };
}

describe("25 record detail: kind-agnostic detail + comment tree, identity, interlinks, viewer state", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("folds a post detail with up/down and a nested comment tree to depth 3", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "pk-p", content: { title: "T", body: "a\n\nb" } });
    await svc.react("pk-r1", { type: "post", id: post.entityId }, "check");
    await svc.react("pk-r2", { type: "post", id: post.entityId }, "cross");
    const c1 = await svc.create({ type: "comment", author: "pk-c1", content: { body: "top" }, parent: { type: "post", id: post.entityId } });
    const c2 = await svc.create({ type: "comment", author: "pk-c2", content: { body: "reply" }, parent: { type: "comment", id: c1.entityId } });
    await svc.create({ type: "comment", author: "pk-c3", content: { body: "deep" }, parent: { type: "comment", id: c2.entityId } });

    const { detail: d, comments } = await detail(w, post.entityId);
    expect(d.id).to.equal(post.entityId);
    expect(d.type).to.equal("post");
    expect(d.title).to.equal("T");
    expect(d.body).to.deep.equal(["a", "b"]);
    expect(d.up).to.equal(1);
    expect(d.down).to.equal(1);
    expect(d.edits).to.equal(0);
    expect(d.appliesToDistrictIds).to.deep.equal([]);
    // C6: raw residence fields never appear under any name.
    expect(d).to.not.have.property("districts");
    expect(d).to.not.have.property("authorDistricts");

    expect(comments).to.have.length(1);
    expect(comments[0].body).to.deep.equal(["top"]);
    expect(comments[0].replies[0].body).to.deep.equal(["reply"]);
    expect(comments[0].replies[0].replies[0].body).to.deep.equal(["deep"]);
  });

  it("petition detail serves signature count + goal + attachedPoll; AB tier-gates the count to null", async () => {
    const svc = seeder(w);
    const pet = await svc.create({
      type: "petition",
      author: "pk-pet",
      content: { title: "Pet", text: "x", attachedPoll: { question: "Q?", options: ["yes", "no"] } },
    });
    await svc.sign("pk-s1", pet.entityId);

    const { detail: d } = await detail(w, pet.entityId);
    expect(d.type).to.equal("petition");
    expect(d.sig).to.equal(1);
    expect(d.goal).to.equal(100); // oursay-global fixed graduation threshold
    expect(d.attachedPoll).to.deep.equal({ question: "Q?", options: ["yes", "no"] });

    // AB petition: ab-ca-gov tier-gates signature counts; detail never filters by tier ⇒ null.
    const ab = await makeAccount(w, { handle: "@ab" });
    const abPet = await svc.create({ type: "petition", author: "pk-abpet", content: { title: "AB", text: "t" } });
    await link(w, "pk-abpet", ab.userId, abPet.entityId, "ab-ca-gov");
    await svc.sign("pk-abs", abPet.entityId);
    const abd = (await detail(w, abPet.entityId)).detail;
    expect(abd.jurisdiction).to.equal("ab-ca-gov");
    expect(abd.sig).to.equal(null);
  });

  it("poll detail serves options + resultId + sourcePetitionId interlinks; result detail serves sourcePollId", async () => {
    const svc = seeder(w);
    const pet = await svc.create({ type: "petition", author: "pk-gpet", content: { title: "Head", text: "t" } });
    const poll = await svc.create({
      type: "poll",
      author: "pk-poll",
      content: { question: "Q?", options: ["yes", "no"], sourcePetitionId: pet.entityId },
    });
    await svc.vote("pk-v1", poll.entityId, "yes");
    const result = await svc.create({
      type: "result",
      author: "pk-res",
      content: { title: "R", sourcePollId: poll.entityId, tallies: [{ option: "yes", count: 2 }] },
    });

    const pd = (await detail(w, poll.entityId)).detail;
    expect(pd.options).to.deep.equal([
      { label: "yes", v: 1 },
      { label: "no", v: 0 },
    ]);
    expect(pd.resultId).to.equal(result.entityId);
    // Graduation chain, backward edge (CONTRACT §11): the poll links back to its petition head.
    expect(pd.sourcePetitionId).to.equal(pet.entityId);

    const rd = (await detail(w, result.entityId)).detail;
    expect(rd.type).to.equal("result");
    expect(rd.sourcePollId).to.equal(poll.entityId);
    expect(rd.options).to.deep.equal([{ label: "yes", v: 2 }]);
  });

  it("404 (not 403) for an unknown id, a deleted root, and a comment (non-root) id", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "pk-p", content: { title: "T", body: "b" } });
    const gone = await svc.create({ type: "post", author: "pk-d", content: { title: "gone", body: "b" } });
    await svc.delete({ entityId: gone.entityId, author: "pk-d" });
    const c1 = await svc.create({ type: "comment", author: "pk-c1", content: { body: "c" }, parent: { type: "post", id: post.entityId } });

    for (const id of [randomUUID(), gone.entityId, c1.entityId]) {
      const res = await w.app.inject({ method: "GET", url: `/v1/public/records/${id}` });
      expect(res.statusCode).to.equal(404, `${id} -> ${res.statusCode}`);
    }
  });

  it("resolves comment-author identity per node: persona for out-of-scope viewers, revealed to self", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "pk-p", content: { title: "T", body: "b" } });
    const commenter = await makeAccount(w, { handle: "@carol", displayName: "Carol" });
    await w.services.repos.profile.setVisibility(commenter.userId, "anonymous");
    const c1 = await svc.create({ type: "comment", author: "pk-carol", content: { body: "hi" }, parent: { type: "post", id: post.entityId } });
    await link(w, "pk-carol", commenter.userId, post.entityId);

    // Anonymous viewer: the comment author is a persona, real handle never leaked.
    const anon = (await detail(w, post.entityId)).comments[0];
    expect(anon.identity.isPersona).to.equal(true);
    expect(anon.identity.handle).to.equal(null);
    expect(JSON.stringify(anon)).to.not.include("@carol");

    // Self: revealed, with the seen-by-others persona hint.
    const session = await w.services.authService.issue(commenter.userId, "full", "test");
    const self = (await detail(w, post.entityId, session.token)).comments[0];
    expect(self.identity.isSelf).to.equal(true);
    expect(self.identity.handle).to.equal("@carol");
    expect(self.identity.seenByOthersAs).to.equal(anon.author);
  });

  it("viewer _my (reaction) and _vote resolve only through the viewer's own persona keys", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "pk-p", content: { title: "T", body: "b" } });
    const poll = await svc.create({ type: "poll", author: "pk-poll", content: { question: "Q?", options: ["yes", "no"] } });
    const viewer = await makeAccount(w, { handle: "@val" });
    await link(w, "pk-val-post", viewer.userId, post.entityId);
    await link(w, "pk-val-poll", viewer.userId, poll.entityId);
    await svc.react("pk-val-post", { type: "post", id: post.entityId }, "check");
    await svc.vote("pk-val-poll", poll.entityId, "no");
    const session = await w.services.authService.issue(viewer.userId, "full", "test");

    // Anonymous: no viewer state.
    expect((await detail(w, post.entityId)).detail._my ?? null).to.equal(null);
    expect((await detail(w, poll.entityId)).detail._vote ?? null).to.equal(null);

    // The viewer: their own reaction/vote surface.
    expect((await detail(w, post.entityId, session.token)).detail._my).to.equal("up");
    expect((await detail(w, poll.entityId, session.token)).detail._vote).to.equal("no");
  });

  it("withholds redacted comment content while keeping the node present", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "pk-p", content: { title: "T", body: "b" } });
    const c1 = await svc.create({ type: "comment", author: "pk-c1", content: { body: "secret" }, parent: { type: "post", id: post.entityId } });
    await w.services.recordStore.redact(c1.txId);

    const { comments } = await detail(w, post.entityId);
    expect(comments).to.have.length(1);
    expect(comments[0].withheld).to.equal(true);
    expect(comments[0].body).to.deep.equal([]);
    expect(JSON.stringify(comments[0])).to.not.include("secret");
  });

  it("standalone comments endpoint returns the same nested thread", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "pk-p", content: { title: "T", body: "b" } });
    const c1 = await svc.create({ type: "comment", author: "pk-c1", content: { body: "top" }, parent: { type: "post", id: post.entityId } });
    await svc.create({ type: "comment", author: "pk-c2", content: { body: "reply" }, parent: { type: "comment", id: c1.entityId } });

    const res = await w.app.inject({ method: "GET", url: `/v1/public/records/${post.entityId}/comments` });
    expect(res.statusCode).to.equal(200, res.body);
    const body = res.json() as { items: any[] };
    expect(body.items).to.have.length(1);
    expect(body.items[0].body).to.deep.equal(["top"]);
    expect(body.items[0].replies[0].body).to.deep.equal(["reply"]);
  });
});
