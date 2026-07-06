// [align-w4-api-surface] P4/P5 — account-level public profile (404-not-403, posts + activity tabs).

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
}

async function profile(w: World, handle: string, token?: string) {
  return w.app.inject({
    method: "GET",
    url: `/v1/public/profiles/${encodeURIComponent(handle)}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function profilePosts(w: World, handle: string, qs = "", token?: string) {
  return w.app.inject({
    method: "GET",
    url: `/v1/public/profiles/${encodeURIComponent(handle)}/posts${qs}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function profileActivity(w: World, handle: string, qs = "", token?: string) {
  return w.app.inject({
    method: "GET",
    url: `/v1/public/profiles/${encodeURIComponent(handle)}/activity${qs}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("29 public profile: visibility gate, posts, activity", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("returns the profile header for a public account", async () => {
    const svc = seeder(w);
    const author = await makeAccount(w, { handle: "@public", displayName: "Public User" });
    await w.services.repos.profile.setVisibility(author.userId, "public");
    const post = await svc.create({ type: "post", author: "pk-pub", content: { title: "Hello", body: "b" } });
    await link(w, "pk-pub", author.userId, post.entityId);

    const res = await profile(w, "public");
    expect(res.statusCode).to.equal(200, res.body);
    const body = res.json() as any;
    expect(body.name).to.equal("Public User");
    expect(body.handle).to.equal("public");
    expect(body.role).to.equal("Member");
  });

  it("404 (not 403) for an anonymous account viewed by a stranger", async () => {
    const svc = seeder(w);
    const author = await makeAccount(w, { handle: "@hidden", displayName: "Hidden User" });
    await w.services.repos.profile.setVisibility(author.userId, "anonymous");
    const post = await svc.create({ type: "post", author: "pk-hid", content: { title: "Secret", body: "b" } });
    await link(w, "pk-hid", author.userId, post.entityId);

    const res = await profile(w, "hidden");
    expect(res.statusCode).to.equal(404);
  });

  it("404 for an unknown handle (same shape as out-of-scope)", async () => {
    const res = await profile(w, "no-such-user-99");
    expect(res.statusCode).to.equal(404);
  });

  it("lets the owner see their own profile even when visibility is anonymous", async () => {
    const svc = seeder(w);
    const author = await makeAccount(w, { handle: "@self", displayName: "Self User" });
    await w.services.repos.profile.setVisibility(author.userId, "anonymous");
    const post = await svc.create({ type: "post", author: "pk-self", content: { title: "Mine", body: "b" } });
    await link(w, "pk-self", author.userId, post.entityId);
    const session = await w.services.authService.issue(author.userId, "full", "test");

    const res = await profile(w, "self", session.token);
    expect(res.statusCode).to.equal(200, res.body);
    expect(res.json().handle).to.equal("self");
  });

  it("lists authored roots on the posts tab as FeedItems", async () => {
    const svc = seeder(w);
    const author = await makeAccount(w, { handle: "@poster", displayName: "Poster" });
    await w.services.repos.profile.setVisibility(author.userId, "public");
    const post = await svc.create({ type: "post", author: "pk-post", content: { title: "My Post", body: "a" } });
    const petition = await svc.create({ type: "petition", author: "pk-post2", content: { title: "Pet", text: "x" } });
    await link(w, "pk-post", author.userId, post.entityId);
    await link(w, "pk-post2", author.userId, petition.entityId);

    const res = await profilePosts(w, "poster");
    expect(res.statusCode).to.equal(200, res.body);
    const body = res.json() as any;
    expect(body.items).to.have.length(2);
    expect(body.items.map((i: any) => i.id).sort()).to.deep.equal([post.entityId, petition.entityId].sort());
    expect(body.items[0]).to.have.property("identity");
    expect(body.items[0]).to.have.property("appliesToDistrictIds");
  });

  it("404 on posts tab when the profile is out of scope", async () => {
    const author = await makeAccount(w, { handle: "@priv", displayName: "Private" });
    await w.services.repos.profile.setVisibility(author.userId, "anonymous");
    const res = await profilePosts(w, "priv");
    expect(res.statusCode).to.equal(404);
  });

  it("keeps per-thread-anonymous participation off the profile (docs/09 §2 — the override severs the link)", async () => {
    const svc = seeder(w);
    const author = await makeAccount(w, { handle: "@twofaced", displayName: "Two Faced" });
    await w.services.repos.profile.setVisibility(author.userId, "public");
    const open = await svc.create({ type: "post", author: "pk-open", content: { title: "Open topic", body: "b" } });
    const masked = await svc.create({ type: "post", author: "pk-masked", content: { title: "Sensitive topic", body: "b" } });
    await link(w, "pk-open", author.userId, open.entityId);
    await link(w, "pk-masked", author.userId, masked.entityId);
    await w.services.recordStore.setThreadVisibility(author.userId, masked.entityId, "anonymous");

    // Stranger: the masked thread must not appear on ANY tab — its presence on the account
    // surface would link the account to the thread persona the override protects.
    const posts = (await profilePosts(w, "twofaced")).json() as any;
    expect(posts.items.map((i: any) => i.id)).to.deep.equal([open.entityId]);
    const activity = (await profileActivity(w, "twofaced")).json() as any;
    expect(JSON.stringify(activity)).to.not.include("Sensitive topic");
    const header = (await profile(w, "twofaced")).json() as any;
    expect(header.support.statements).to.equal(1);

    // Self: sees both (self is always revealed to self).
    const session = await w.services.authService.issue(author.userId, "full", "test");
    const own = (await profilePosts(w, "twofaced", "", session.token)).json() as any;
    expect(own.items.map((i: any) => i.id).sort()).to.deep.equal([open.entityId, masked.entityId].sort());
  });

  it("derives activity rows from record_tx", async () => {
    const svc = seeder(w);
    const author = await makeAccount(w, { handle: "@active", displayName: "Active User" });
    await w.services.repos.profile.setVisibility(author.userId, "public");
    const post = await svc.create({ type: "post", author: "pk-act", content: { title: "Topic", body: "b" } });
    await link(w, "pk-act", author.userId, post.entityId);
    await svc.create({
      type: "comment",
      author: "pk-act",
      content: { body: "hi" },
      parent: { type: "post", id: post.entityId },
    });
    await svc.react("pk-act", { type: "post", id: post.entityId }, "check");

    const res = await profileActivity(w, "active");
    expect(res.statusCode).to.equal(200, res.body);
    const kinds = (res.json() as any).items.map((i: any) => i.kind);
    expect(kinds).to.include("statement");
    expect(kinds).to.include("comment");
    expect(kinds).to.include("reaction");
  });
});
