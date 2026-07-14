// [align-w4-api-surface] A5 — self-only batch read of viewer participation markers.

import { expect } from "chai";
import { PublicChain, RecordService } from "@oursay/public-record";
import { randomUUID } from "node:crypto";
import { makeAccount } from "./helpers/account.js";
import { resetWorld, type World } from "./helpers/world.js";

function seeder(w: World): RecordService {
  return new RecordService(
    new PublicChain(w.services.recordStore, randomUUID(), w.services.ledger, w.services.connectLedger),
    w.services.recordStore,
  );
}

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

function recordState(w: World, ids: string[], token: string) {
  const qs = ids.map((id) => `ids=${encodeURIComponent(id)}`).join("&");
  return w.app.inject({
    method: "GET",
    url: `/v1/me/record-state?${qs}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("26 record-state: self-only batch participation markers", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("returns _my, _vote, signed, and shared for the viewer's own participation", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "pk-p", content: { title: "T", body: "b" } });
    const poll = await svc.create({ type: "poll", author: "pk-poll", content: { question: "Q?", options: ["yes", "no"] } });
    const pet = await svc.create({ type: "petition", author: "pk-pet", content: { title: "Pet", text: "x" } });
    const viewer = await makeAccount(w, { handle: "@val" });
    await link(w, "pk-val-post", viewer.userId, post.entityId);
    await link(w, "pk-val-poll", viewer.userId, poll.entityId);
    await link(w, "pk-val-pet", viewer.userId, pet.entityId);
    await svc.react("pk-val-post", { type: "post", id: post.entityId }, "check");
    await svc.vote("pk-val-poll", poll.entityId, "no");
    await svc.sign("pk-val-pet", pet.entityId);
    const session = await w.services.authService.issue(viewer.userId, "full", "test");
    await w.app.inject({
      method: "POST",
      url: `/v1/me/shares/${post.entityId}`,
      headers: { authorization: `Bearer ${session.token}` },
    });

    const res = await recordState(w, [post.entityId, poll.entityId, pet.entityId], session.token);
    expect(res.statusCode).to.equal(200, res.body);
    const body = res.json() as { states: Record<string, any> };
    expect(body.states[post.entityId]).to.deep.equal({
      _my: "up",
      _myEntityId: body.states[post.entityId]._myEntityId,
      _vote: null,
      signed: false,
      shared: true,
    });
    expect(body.states[post.entityId]._myEntityId).to.be.a("string");
    expect(body.states[poll.entityId]).to.deep.equal({
      _my: null,
      _myEntityId: null,
      _vote: "no",
      signed: false,
      shared: false,
    });
    expect(body.states[pet.entityId]).to.deep.equal({
      _my: null,
      _myEntityId: null,
      _vote: null,
      signed: true,
      shared: false,
    });
  });

  it("resolves comment ids through the root thread persona", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "pk-p", content: { title: "T", body: "b" } });
    const c1 = await svc.create({
      type: "comment",
      author: "pk-c1",
      content: { body: "c" },
      parent: { type: "post", id: post.entityId },
    });
    const viewer = await makeAccount(w, { handle: "@val" });
    await link(w, "pk-val", viewer.userId, post.entityId);
    await svc.react("pk-val", { type: "comment", id: c1.entityId }, "cross");
    const session = await w.services.authService.issue(viewer.userId, "full", "test");

    const res = await recordState(w, [c1.entityId], session.token);
    expect(res.statusCode).to.equal(200, res.body);
    expect(res.json().states[c1.entityId]._my).to.equal("down");
    expect(res.json().states[c1.entityId]._myEntityId).to.be.a("string");
  });

  it("never leaks another user's participation", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "pk-p", content: { title: "T", body: "b" } });
    const other = await makeAccount(w, { handle: "@other" });
    await link(w, "pk-other", other.userId, post.entityId);
    await svc.react("pk-other", { type: "post", id: post.entityId }, "check");

    const viewer = await makeAccount(w, { handle: "@me" });
    const session = await w.services.authService.issue(viewer.userId, "full", "test");
    const res = await recordState(w, [post.entityId], session.token);
    expect(res.statusCode).to.equal(200, res.body);
    expect(res.json().states[post.entityId]).to.deep.equal({
      _my: null,
      _myEntityId: null,
      _vote: null,
      signed: false,
      shared: false,
    });
  });

  it("requires full session auth", async () => {
    const res = await w.app.inject({ method: "GET", url: "/v1/me/record-state?ids=x" });
    expect(res.statusCode).to.equal(401);
  });
});
