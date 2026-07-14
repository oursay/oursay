// [align-w4-api-surface] P1 — the unified, viewer-optional public feed. Seeds entities via the
// dev-path RecordService, links authors to accounts via thread-key bindings (the same rows the
// civic engine writes at join), and asserts the W2→backend contract on the wire: FeedItem-shaped
// rows, jurisdiction IDS, appliesToDistrictIds naming, persona identity for anonymous viewers vs
// revealed identity for in-scope viewers, count-exposure policy on scalars, and that raw author
// districts NEVER appear (C6). The anonymous-vs-authed pair on one read is the QA acceptance bar.

import { expect } from "chai";
import { randomUUID } from "node:crypto";
import { PublicChain, RecordService } from "@oursay/public-record";
import { makeAccount } from "./helpers/account.js";
import { resetWorld, type World } from "./helpers/world.js";

/** A dev-path writer over the shared record store (unsigned; one fresh chain id per call). */
function seeder(w: World): RecordService {
  return new RecordService(
    new PublicChain(w.services.recordStore, randomUUID(), w.services.ledger, w.services.connectLedger),
    w.services.recordStore,
  );
}

/** Link a dev-path author pubkey to an account for one thread (what a real join writes). */
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

async function feed(w: World, qs = "", token?: string) {
  const res = await w.app.inject({
    method: "GET",
    url: `/v1/public/feed${qs}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  expect(res.statusCode).to.equal(200, res.body);
  return res.json() as { items: any[]; nextCursor: string | null; total: number };
}

describe("22 public feed: unified list, viewer-optional identity, filters, cursor", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("lists all four root types newest-first with per-kind metrics and FeedItem field names", async () => {
    const svc = seeder(w);
    const post = await svc.create({ type: "post", author: "pk-p", content: { title: "T", body: "a\n\nb" } });
    const petition = await svc.create({ type: "petition", author: "pk-pet", content: { title: "Pet", text: "x" } });
    const poll = await svc.create({ type: "poll", author: "pk-poll", content: { question: "Q?", options: ["yes", "no"] } });
    const result = await svc.create({
      type: "result",
      author: "pk-res",
      content: { title: "R", sourcePollId: poll.entityId, tallies: [{ option: "yes", count: 2 }] },
    });
    await svc.react("pk-r1", { type: "post", id: post.entityId }, "check");
    await svc.sign("pk-s1", petition.entityId);
    await svc.vote("pk-v1", poll.entityId, "yes");
    const c1 = await svc.create({ type: "comment", author: "pk-c1", content: { body: "top" }, parent: { type: "post", id: post.entityId } });
    await svc.create({ type: "comment", author: "pk-c2", content: { body: "nested" }, parent: { type: "comment", id: c1.entityId } });

    const body = await feed(w);
    expect(body.items.map((i) => i.id)).to.deep.equal([result.entityId, poll.entityId, petition.entityId, post.entityId]);
    expect(body.nextCursor).to.equal(null);
    expect(body.total).to.equal(4);

    const p = body.items[3];
    expect(p.type).to.equal("post");
    expect(p.jurisdiction).to.equal("oursay-global");
    expect(p.title).to.equal("T");
    expect(p.body).to.deep.equal(["a", "b"]);
    expect(p.up).to.equal(1);
    expect(p.down).to.equal(0);
    expect(p.comments).to.equal(2); // nested depths count
    expect(p.edits).to.equal(0);
    expect(p.appliesToDistrictIds).to.deep.equal([]);
    // C6: raw residence fields must never appear under any name.
    expect(p).to.not.have.property("districts");
    expect(p).to.not.have.property("authorDistricts");

    const pet = body.items[2];
    expect(pet.sig).to.equal(1);
    expect(pet.goal).to.equal(100); // oursay-global fixed graduation threshold

    const pl = body.items[1];
    expect(pl.options).to.deep.equal([
      { label: "yes", v: 1 },
      { label: "no", v: 0 },
    ]);

    const rs = body.items[0];
    expect(rs.options).to.deep.equal([{ label: "yes", v: 2 }]);
  });

  it("anonymous viewer gets the per-thread persona; an authed viewer sees a public author revealed", async () => {
    const svc = seeder(w);
    const author = await makeAccount(w, { handle: "@jane", displayName: "Jane" });
    await w.services.repos.profile.setVisibility(author.userId, "public");
    await w.services.repos.user.setIconType(author.userId, "rings");
    const post = await svc.create({ type: "post", author: "pk-jane", content: { title: "Hello", body: "hi" } });
    await link(w, "pk-jane", author.userId, post.entityId);

    // Anonymous: persona only — never the real handle.
    const anon = (await feed(w)).items[0];
    expect(anon.identity.isPersona).to.equal(false, "public visibility reveals even to anonymous viewers");
    expect(anon.identity.handle).to.equal("jane");
    expect(anon.identity.iconType).to.equal("rings");

    // Flip to anonymous visibility: nobody (but self) sees the handle.
    await w.services.repos.profile.setVisibility(author.userId, "anonymous");
    const masked = (await feed(w)).items[0];
    expect(masked.identity.isPersona).to.equal(true);
    expect(masked.identity.handle).to.equal(null);
    expect(masked.identity.iconType).to.equal(undefined);
    expect(masked.author).to.match(/^[A-Z][A-Za-z]*\d{2,}$/); // AdjectiveAnimalNN persona
    expect(masked.handle).to.equal(masked.author);
    expect(JSON.stringify(masked)).to.not.include("@jane");

    // Self: always revealed, with the seen-by-others persona hint.
    const session = await w.services.authService.issue(author.userId, "full", "test");
    const self = (await feed(w, "", session.token)).items[0];
    expect(self.identity.isSelf).to.equal(true);
    expect(self.identity.handle).to.equal("jane");
    expect(self.identity.iconType).to.equal("rings");
    expect(self.identity.seenByOthersAs).to.equal(masked.author);
  });

  it("id_verified visibility reveals only to identity-verified viewers (viewer-optional resolution)", async () => {
    const svc = seeder(w);
    const author = await makeAccount(w, { handle: "@vera", displayName: "Vera" });
    await w.services.repos.profile.setVisibility(author.userId, "id_verified");
    const post = await svc.create({ type: "post", author: "pk-vera", content: { title: "V", body: "x" } });
    await link(w, "pk-vera", author.userId, post.entityId);

    const viewer = await makeAccount(w, {});
    const session = await w.services.authService.issue(viewer.userId, "full", "test");

    // Unverified viewer: persona.
    expect((await feed(w, "", session.token)).items[0].identity.isPersona).to.equal(true);
    // Identity-verified viewer: revealed.
    await w.services.recordStore.putAttestation({ userId: viewer.userId, provider: "stub", tier: "identity_verified" });
    const revealed = (await feed(w, "", session.token)).items[0];
    expect(revealed.identity.isPersona).to.equal(false);
    expect(revealed.identity.handle).to.equal("vera");
    // The author's own tier travels as a token (unverified here) — never a numeric.
    expect(revealed.tier).to.equal("unverified");
  });

  it("filters by types[], jurisdictions[], and tierMin; AB tier-gated scalars serve null", async () => {
    const svc = seeder(w);
    const ab = await makeAccount(w, { handle: "@ab_user", displayName: "Ab" });
    await w.services.recordStore.putAttestation({ userId: ab.userId, provider: "stub", tier: "residency_verified" });

    const gPost = await svc.create({ type: "post", author: "pk-g", content: { title: "G", body: "g" } });
    const abPet = await svc.create({ type: "petition", author: "pk-ab", content: { title: "AB pet", text: "t" } });
    await link(w, "pk-ab", ab.userId, abPet.entityId, "ab-ca-gov");
    await svc.sign("pk-s", abPet.entityId);

    const types = await feed(w, "?types=post");
    expect(types.items.map((i) => i.id)).to.deep.equal([gPost.entityId]);
    expect(types.total).to.equal(1);

    const jur = await feed(w, "?jurisdictions=ab-ca-gov");
    expect(jur.items.map((i) => i.id)).to.deep.equal([abPet.entityId]);
    expect(jur.total).to.equal(1);
    expect(jur.items[0].jurisdiction).to.equal("ab-ca-gov");
    // ab-ca-gov tier-gates signature counts: the feed never filters by tier ⇒ scalar withheld.
    expect(jur.items[0].sig).to.equal(null);

    // tierMin=2: only the residency-verified author's row survives.
    const tiered = await feed(w, "?tierMin=2");
    expect(tiered.items.map((i) => i.id)).to.deep.equal([abPet.entityId]);
    expect(tiered.total).to.equal(1);
    expect(tiered.items[0].tier).to.equal("residency_verified");

    // signedMin=1: all dev-path rows are quick (sign_tier 0) ⇒ empty page.
    const signed = await feed(w, "?signedMin=1");
    expect(signed.items).to.deep.equal([]);
    expect(signed.total).to.equal(0);
  });

  it("paginates with an opaque cursor (no skips or repeats)", async () => {
    const svc = seeder(w);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push((await svc.create({ type: "post", author: `pk-${i}`, content: { title: `t${i}`, body: "b" } })).entityId);
    }
    const page1 = await feed(w, "?limit=2");
    expect(page1.items.map((i) => i.id)).to.deep.equal([ids[4], ids[3]]);
    expect(page1.nextCursor).to.be.a("string");
    expect(page1.total).to.equal(5);

    const page2 = await feed(w, `?limit=2&cursor=${page1.nextCursor}`);
    expect(page2.items.map((i) => i.id)).to.deep.equal([ids[2], ids[1]]);
    expect(page2.total).to.equal(5);

    const page3 = await feed(w, `?limit=2&cursor=${page2.nextCursor}`);
    expect(page3.items.map((i) => i.id)).to.deep.equal([ids[0]]);
    expect(page3.nextCursor).to.equal(null);
  });

  it("keeps deleted roots out and withholds redacted content while the row stays present", async () => {
    const svc = seeder(w);
    const keep = await svc.create({ type: "post", author: "pk-k", content: { title: "keep", body: "b" } });
    const gone = await svc.create({ type: "post", author: "pk-d", content: { title: "gone", body: "b" } });
    await svc.delete({ entityId: gone.entityId, author: "pk-d" });
    const red = await svc.create({ type: "post", author: "pk-r", content: { title: "secret", body: "b" } });
    await w.services.recordStore.redact(red.txId);

    const body = await feed(w);
    const byId = new Map(body.items.map((i) => [i.id, i]));
    expect(byId.has(gone.entityId)).to.equal(false);
    expect(byId.get(keep.entityId)!.title).to.equal("keep");
    const r = byId.get(red.entityId)!;
    expect(r.withheld).to.equal(true);
    expect(r.title).to.equal("");
    expect(JSON.stringify(r)).to.not.include("secret");
  });
});
