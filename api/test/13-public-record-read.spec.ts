// Public, unauthenticated read surface (/v1/public/…) over the civic record. Seeds entities via the
// dev-path RecordService (like public-record/test/07-projections.spec.ts), then asserts the HTTP
// responses match projection truth, carry audience scope, exclude tombstones, and validate the
// stubbed filter params. No auth header is ever sent — these routes must be open.

import { expect } from "chai";
import { randomUUID } from "node:crypto";
import { PublicChain, RecordService } from "@oursay/public-record";
import { resetWorld, type World } from "./helpers/world.js";

/** A dev-path writer over the shared record store (unsigned; one fresh chain id per call). */
function seeder(w: World): RecordService {
  return new RecordService(new PublicChain(w.services.recordStore, randomUUID()), w.services.recordStore);
}

describe("13 public record read: browse, detail, counts, stubbed filters", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("lists posts (newest first) with reaction tallies and renders the thread detail", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "alice", content: { title: "T", body: "root" } });
    const c1 = await svc.create({ type: "comment", author: "bob", content: { body: "top" }, parent: { type: "post", id: post.entityId } });
    await svc.create({ type: "comment", author: "carol", content: { body: "reply" }, parent: { type: "comment", id: c1.entityId } });
    await svc.react("bob", { type: "post", id: post.entityId }, "check");
    await svc.react("carol", { type: "post", id: post.entityId }, "check");

    const list = await w.app.inject({ method: "GET", url: "/v1/public/posts" });
    expect(list.statusCode).to.equal(200);
    const body = list.json() as { items: any[]; page: any; filters: any };
    expect(body.items).to.have.length(1);
    expect(body.items[0].entityId).to.equal(post.entityId);
    expect(body.items[0].reactions).to.deep.equal([{ kind: "check", count: 2 }]);
    expect(body.page.total).to.equal(1);
    expect(body.filters.applied).to.equal(false);

    const detail = await w.app.inject({ method: "GET", url: `/v1/public/posts/${post.entityId}` });
    expect(detail.statusCode).to.equal(200);
    const thread = detail.json() as any;
    expect(thread.root.type).to.equal("post");
    expect(thread.reactionsByEntity).to.deep.equal([{ kind: "check", count: 2 }]);
    expect(thread.comments).to.have.length(1);
    expect(thread.comments[0].state.entityId).to.equal(c1.entityId);
    expect(thread.comments[0].replies).to.have.length(1);
  });

  it("tallies poll results on list, detail, and counts endpoints", async () => {
    const svc = seeder(w);
    const poll = await svc.create({ type: "poll", author: "alice", content: { question: "q?", options: ["yes", "no"] } });
    await svc.vote("bob", poll.entityId, "yes");
    await svc.vote("carol", poll.entityId, "yes");
    await svc.vote("dave", poll.entityId, "no");

    const list = (await w.app.inject({ method: "GET", url: "/v1/public/polls" })).json() as any;
    expect(list.items[0].results).to.deep.include.members([
      { option: "yes", count: 2 },
      { option: "no", count: 1 },
    ]);

    const detail = (await w.app.inject({ method: "GET", url: `/v1/public/polls/${poll.entityId}` })).json() as any;
    expect(detail.results).to.deep.include.members([{ option: "yes", count: 2 }, { option: "no", count: 1 }]);

    const counts = await w.app.inject({ method: "GET", url: `/v1/public/polls/${poll.entityId}/counts` });
    expect(counts.statusCode).to.equal(200);
    const cbody = counts.json() as any;
    expect(cbody.results).to.deep.include.members([{ option: "yes", count: 2 }]);
    expect(cbody.countGating).to.equal("none");
    expect(cbody.filters.applied).to.equal(false);
  });

  it("counts active petition signatures (revocations excluded)", async () => {
    const svc = seeder(w);
    const petition = await svc.create({
      type: "petition",
      author: "alice",
      content: { title: "t", text: "x", rules: { allowRevoke: true, deadline: new Date(Date.now() + 60_000).toISOString() } },
    });
    await svc.sign("bob", petition.entityId);
    await svc.sign("carol", petition.entityId);
    await svc.sign("dave", petition.entityId);
    await svc.revoke("dave", petition.entityId);

    const detail = (await w.app.inject({ method: "GET", url: `/v1/public/petitions/${petition.entityId}` })).json() as any;
    expect(detail.signatureCount).to.equal(2);

    const counts = (await w.app.inject({ method: "GET", url: `/v1/public/petitions/${petition.entityId}/counts` })).json() as any;
    expect(counts.signatureCount).to.equal(2);
    expect(counts.countGating).to.equal("none");
  });

  it("defaults audience scope to oursay-global with empty districts for a plain post", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "alice", content: { body: "hi" } });
    const detail = (await w.app.inject({ method: "GET", url: `/v1/public/posts/${post.entityId}` })).json() as any;
    expect(detail.audienceScope).to.deep.equal({ jurisdiction: "oursay-global", appliesToDistrictIds: [] });
  });

  it("surfaces appliesToDistrictIds from a poll's governance rules", async () => {
    const svc = seeder(w);
    const districts = ["edmonton-strathcona-2026"];
    const poll = await svc.create({
      type: "poll",
      author: "alice",
      content: { question: "q?", options: ["yes", "no"], rules: { appliesToDistrictIds: districts } },
    });
    const detail = (await w.app.inject({ method: "GET", url: `/v1/public/polls/${poll.entityId}` })).json() as any;
    expect(detail.audienceScope.appliesToDistrictIds).to.deep.equal(districts);
  });

  it("resolves a non-default jurisdiction from the thread binding", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "alice", content: { body: "hi" } });
    const userId = randomUUID();
    await w.services.recordStore.putUser({ id: userId });
    await w.services.recordStore.registerThreadBinding({
      threadPubkey: `pk-${randomUUID()}`,
      userId,
      threadId: post.entityId,
      jurisdiction: "ab-ca-gov",
      commitment: "c0",
      bindingSig: "s0",
    });
    const detail = (await w.app.inject({ method: "GET", url: `/v1/public/posts/${post.entityId}` })).json() as any;
    expect(detail.audienceScope.jurisdiction).to.equal("ab-ca-gov");
  });

  it("excludes tombstoned roots from the list and total, and 404s their detail", async () => {
    const svc = seeder(w);
    const live = await svc.create({ type: "post", author: "alice", content: { body: "live" } });
    const gone = await svc.create({ type: "post", author: "alice", content: { body: "gone" } });
    await svc.delete({ entityId: gone.entityId, author: "alice" });

    const list = (await w.app.inject({ method: "GET", url: "/v1/public/posts" })).json() as any;
    expect(list.items.map((i: any) => i.entityId)).to.deep.equal([live.entityId]);
    expect(list.page.total).to.equal(1);

    const detail = await w.app.inject({ method: "GET", url: `/v1/public/posts/${gone.entityId}` });
    expect(detail.statusCode).to.equal(404);
  });

  it("withholds content for a redacted root (content null, withheld true)", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "alice", content: { body: "secret" } });
    await w.services.recordStore.redact(post.txId);

    const detail = (await w.app.inject({ method: "GET", url: `/v1/public/posts/${post.entityId}` })).json() as any;
    expect(detail.root.withheld).to.equal(true);
    expect(detail.root.content).to.equal(null);
  });

  it("requires no authentication", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "alice", content: { body: "open" } });
    const res = await w.app.inject({ method: "GET", url: `/v1/public/posts/${post.entityId}` }); // no Authorization header
    expect(res.statusCode).to.equal(200);
  });

  it("accepts scope=my-district but resolves nothing (inert stub)", async () => {
    const res = await w.app.inject({ method: "GET", url: "/v1/public/posts?scope=my-district" });
    expect(res.statusCode).to.equal(200);
    const body = res.json() as any;
    expect(body.filters.scope).to.equal("my-district");
    expect(body.filters.applied).to.equal(false);
    expect(body.filters.note).to.match(/inert|resolves nothing/i);
  });

  it("400s on an unknown scope or tier value", async () => {
    const badScope = await w.app.inject({ method: "GET", url: "/v1/public/posts?scope=my-street" });
    expect(badScope.statusCode).to.equal(400);
    const badTier = await w.app.inject({ method: "GET", url: "/v1/public/posts?tier=super_verified" });
    expect(badTier.statusCode).to.equal(400);
  });

  it("404s unknown ids and type mismatches", async () => {
    const svc = seeder(w);
    const poll = await svc.create({ type: "poll", author: "alice", content: { question: "q?", options: ["a", "b"] } });

    const unknown = await w.app.inject({ method: "GET", url: `/v1/public/posts/${randomUUID()}` });
    expect(unknown.statusCode).to.equal(404);

    const mismatch = await w.app.inject({ method: "GET", url: `/v1/public/posts/${poll.entityId}` }); // poll id on /posts
    expect(mismatch.statusCode).to.equal(404);
  });
});
