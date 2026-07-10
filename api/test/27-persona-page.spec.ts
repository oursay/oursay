// [align-w4-api-surface] P6 — thread-scoped persona profile surface.

import { expect } from "chai";
import { randomUUID } from "node:crypto";
import { PublicChain, RecordService } from "@oursay/public-record";
import { makeAccount } from "./helpers/account.js";
import { resetWorld, type World } from "./helpers/world.js";

function seeder(w: World): RecordService {
  return new RecordService(new PublicChain(w.services.recordStore, randomUUID()), w.services.recordStore);
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
  return w.services.recordStore.getPersonaName(pubkey);
}

async function personaPage(w: World, name: string, token?: string) {
  return w.app.inject({
    method: "GET",
    url: `/v1/public/personas/${encodeURIComponent(name)}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("27 persona page: thread-scoped identity + authored comments", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("returns identity and thread-scoped comments for a known persona", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "pk-p", content: { title: "T", body: "b" } });
    const commenter = await makeAccount(w, { handle: "@carol", displayName: "Carol" });
    await w.services.repos.profile.setVisibility(commenter.userId, "anonymous");
    const personaName = await link(w, "pk-carol", commenter.userId, post.entityId);
    await svc.create({
      type: "comment",
      author: "pk-carol",
      content: { body: "hello" },
      parent: { type: "post", id: post.entityId },
    });
    await svc.create({
      type: "comment",
      author: "pk-other",
      content: { body: "noise" },
      parent: { type: "post", id: post.entityId },
    });

    const res = await personaPage(w, personaName!);
    expect(res.statusCode).to.equal(200, res.body);
    const body = res.json() as any;
    expect(body.name).to.equal(personaName);
    expect(body.threadId).to.equal(post.entityId);
    expect(body.isRootAuthor).to.equal(false);
    expect(body.comments).to.have.length(1);
    expect(body.comments[0].body).to.deep.equal(["hello"]);
    expect(body.comments[0].identity.isPersona).to.equal(true);
    expect(body.comments[0].identity.handle).to.equal(null);
    expect(JSON.stringify(body)).to.not.include("@carol");
  });

  it("marks isRootAuthor when the persona authored the thread root", async () => {
    const svc = seeder(w);
    const author = await makeAccount(w, { handle: "@root" });
    const post = await svc.create({ type: "post", author: "pk-root", content: { title: "Mine", body: "b" } });
    const personaName = await link(w, "pk-root", author.userId, post.entityId);

    const res = await personaPage(w, personaName!);
    expect(res.statusCode).to.equal(200, res.body);
    expect(res.json().isRootAuthor).to.equal(true);
  });

  it("404 (not 403) for an unknown persona name", async () => {
    const res = await personaPage(w, "NoSuchPersona99");
    expect(res.statusCode).to.equal(404);
  });

  it("reveals identity to self when the viewer owns the persona", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "pk-p", content: { title: "T", body: "b" } });
    const commenter = await makeAccount(w, { handle: "@self", displayName: "Self User" });
    await w.services.repos.profile.setVisibility(commenter.userId, "anonymous");
    const personaName = await link(w, "pk-self", commenter.userId, post.entityId);
    await svc.create({
      type: "comment",
      author: "pk-self",
      content: { body: "mine" },
      parent: { type: "post", id: post.entityId },
    });
    const session = await w.services.authService.issue(commenter.userId, "full", "test");

    const res = await personaPage(w, personaName!, session.token);
    expect(res.statusCode).to.equal(200, res.body);
    expect(res.json().identity.isSelf).to.equal(true);
    expect(res.json().identity.handle).to.equal("self");
  });

  it("includes thread-scoped activity from record_tx (reactions, comments, posts)", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "pk-p", content: { title: "Topic", body: "b" } });
    const commenter = await makeAccount(w, { handle: "@react", displayName: "Reactor" });
    await w.services.repos.profile.setVisibility(commenter.userId, "anonymous");
    const personaName = await link(w, "pk-react", commenter.userId, post.entityId);
    await svc.create({
      type: "comment",
      author: "pk-react",
      content: { body: "hi" },
      parent: { type: "post", id: post.entityId },
    });
    await svc.react("pk-react", { type: "post", id: post.entityId }, "check");

    const res = await personaPage(w, personaName!);
    expect(res.statusCode).to.equal(200, res.body);
    const kinds = (res.json() as any).activity.map((i: any) => i.kind);
    expect(kinds).to.include("comment");
    expect(kinds).to.include("reaction");
  });
});
