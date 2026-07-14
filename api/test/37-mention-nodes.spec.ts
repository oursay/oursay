// Mention nodes Slice 2: prepare allocate, submit mention_index, read mentions metadata
// (docs/entities/civic-identity/mention-node.md; docs/temp/MENTION-NODES-SLICE2-HANDOFF.md).
// Slice 4: Mentions tabs visibility (docs/09 §2 sever + soft-mode + persona scope).

import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { buildMentionToken } from "@oursay/encode";

process.env.OURSAY_DEV_PASSKEY = "1";

import { CivicHttpClient, DevPasskeyConnector, IdentitySession } from "@oursay/identity/client";
import type { Intent, ThreadRef } from "@oursay/identity";
import { registerJurisdiction, type JurisdictionGates } from "@oursay/public-record";
import { injectFetch } from "./helpers/inject-fetch.js";
import { resetWorld, type World } from "./helpers/world.js";
import { fullSessionAccount } from "./helpers/account.js";

const JURISDICTION = "test-37-mentions";
const PASSKEY_ALL = Object.fromEntries(
  ["post", "petition", "poll", "result", "comment", "reaction", "vote", "petition_signature"].map((a) => [
    a,
    { act: "anyone", signMin: "passkey" },
  ]),
) as JurisdictionGates;
registerJurisdiction({ id: JURISDICTION, level: "test", rules: {}, gates: PASSKEY_ALL });

interface Member {
  userId: string;
  token: string;
  client: CivicHttpClient;
  sess: IdentitySession;
  threadId: string;
  t: ThreadRef;
}

async function enrolledMember(w: World, email: string, seed: string, threadId?: string): Promise<Member> {
  const { userId, token } = await fullSessionAccount(w, email);
  const passkey = new DevPasskeyConnector({ rootDir: mkdtempSync(join(tmpdir(), "oursay-mention-")), seed });
  await passkey.enrollDevice({ userId, deviceId: "A", label: "phone A" });
  const sess = new IdentitySession(await passkey.unlock({ userId, deviceId: "A" }));
  const tid = threadId ?? randomUUID();
  const t: ThreadRef = { threadId: tid, jurisdiction: JURISDICTION };
  const client = new CivicHttpClient({ baseUrl: "http://localhost", session: sess, token, fetch: injectFetch(w.app) });
  await client.ensureJoined(t);
  return { userId, token, client, sess, threadId: tid, t };
}

/** Create the thread root as a post containing a related profile @ mention. */
async function submitRelatedRootMention(
  citer: Member,
  mentionedUserId: string,
  bodyText: string,
): Promise<{ txId: string; entityId: string; token: string }> {
  const intent: Intent = {
    op: "create",
    type: "post",
    entityId: citer.threadId,
    content: { title: bodyText, body: "placeholder" },
  };
  const prep = await citer.client.prepare(citer.t, intent, [
    { kind: "profile", userId: mentionedUserId },
  ]);
  expect(prep.mentionNodes![0]!.userId).to.equal(mentionedUserId);
  const nodeId = prep.mentionNodes![0]!.nodeId;
  const token = buildMentionToken(nodeId);
  const finalIntent: Intent = {
    ...intent,
    content: { title: bodyText, body: `${bodyText} ${token}` },
  };
  const signed = await citer.sess.buildSigned(citer.t, prep, finalIntent);
  const ref = await citer.client.submit(signed);
  return { txId: ref.txId, entityId: ref.entityId, token };
}

/** Comment on an existing root with a persona @ mention. */
async function submitPersonaCommentMention(
  citer: Member,
  rootEntityId: string,
  personaName: string,
  bodyText: string,
): Promise<void> {
  const intent: Intent = {
    op: "create",
    type: "comment",
    entityId: randomUUID(),
    content: { body: "placeholder" },
    parent: { type: "post", id: rootEntityId },
  };
  const prep = await citer.client.prepare(citer.t, intent, [{ kind: "persona", personaName }]);
  expect(prep.mentionNodes![0]!.userId).to.be.a("string");
  const token = buildMentionToken(prep.mentionNodes![0]!.nodeId);
  await citer.client.submit(
    await citer.sess.buildSigned(citer.t, prep, {
      ...intent,
      content: { body: `${bodyText} ${token}` },
    }),
  );
}

describe("37 mention nodes: prepare allocate, submit index, read resolve", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("prepare related profile is idempotent; unauthorized profile → Someone; index + read metadata", async () => {
    const author = await enrolledMember(w, "mention-author@example.com", "author");
    const target = await enrolledMember(w, "mention-target@example.com", "target", author.threadId);
    await w.services.repos.profile.setVisibility(target.userId, "public");

    const intent: Intent = {
      op: "create",
      type: "post",
      entityId: author.threadId,
      content: { title: "placeholder", body: "placeholder" },
    };

    const prep1 = await author.client.prepare(author.t, intent, [
      { kind: "profile", userId: target.userId },
    ]);
    expect(prep1.mentionNodes).to.have.length(1);
    expect(prep1.mentionNodes![0]!.userId).to.equal(target.userId);
    const nodeId = prep1.mentionNodes![0]!.nodeId;

    const prep2 = await author.client.prepare(author.t, intent, [
      { kind: "profile", userId: target.userId },
    ]);
    expect(prep2.mentionNodes![0]!.nodeId).to.equal(nodeId);

    // Unauthorized (anonymous visibility) → unresolved Someone node (no userId).
    const stranger = await enrolledMember(w, "mention-stranger@example.com", "stranger");
    await w.services.repos.profile.setVisibility(stranger.userId, "anonymous");
    const prepU = await author.client.prepare(author.t, intent, [
      { kind: "profile", userId: stranger.userId },
    ]);
    expect(prepU.mentionNodes).to.have.length(1);
    expect(prepU.mentionNodes![0]!.userId).to.equal(undefined);

    // Soft-mode reserved: related user who has NOT joined this thread.
    const soft = await fullSessionAccount(w, "mention-soft@example.com");
    await w.services.repos.profile.setVisibility(soft.userId, "public");
    const prepSoft = await author.client.prepare(author.t, intent, [
      { kind: "profile", userId: soft.userId },
    ]);
    expect(prepSoft.mentionNodes![0]!.userId).to.equal(soft.userId);
    const softNode = prepSoft.mentionNodes![0]!.nodeId;

    // Final prepare allocates (related nodes reuse; unresolved mints a fresh Someone each time).
    const prep = await author.client.prepare(author.t, intent, [
      { kind: "profile", userId: target.userId },
      { kind: "profile", userId: stranger.userId },
      { kind: "profile", userId: soft.userId },
    ]);
    expect(prep.mentionNodes).to.have.length(3);
    expect(prep.mentionNodes![0]!.nodeId).to.equal(nodeId);
    expect(prep.mentionNodes![0]!.userId).to.equal(target.userId);
    expect(prep.mentionNodes![1]!.userId).to.equal(undefined);
    expect(prep.mentionNodes![2]!.nodeId).to.equal(softNode);
    const someoneNode = prep.mentionNodes![1]!.nodeId;

    const relatedToken = buildMentionToken(nodeId);
    const someoneToken = buildMentionToken(someoneNode);
    const softToken = buildMentionToken(softNode);
    const body = `Thanks ${relatedToken} and ${someoneToken} and ${softToken}`;
    const finalIntent: Intent = {
      op: "create",
      type: "post",
      entityId: author.threadId,
      content: { title: `Hi ${relatedToken}`, body },
    };
    // Sign over the final content (tokens embedded); prep fields still valid for this entity.
    const signed = await author.sess.buildSigned(author.t, prep, finalIntent);
    const ref = await author.client.submit(signed);
    expect(ref.entityId).to.equal(author.threadId);

    // mention_index: related only (target + soft); not stranger (unresolved).
    const idx = await w.services.recordStore.getMentionMapByNodeIds([nodeId, someoneNode, softNode]);
    expect(idx.get(nodeId)?.mentionedUserId).to.equal(target.userId);
    expect(idx.get(someoneNode)?.mentionedUserId).to.equal(null);
    expect(idx.get(softNode)?.mentionedUserId).to.equal(soft.userId);

    // Direct SQL count via store: use insert idempotency path — query through a second get after
    // projecting by listing index isn't exposed; assert via raw pool on services.db if available.
    const { rows: indexRows } = await w.db.pool.query(
      `SELECT mentioned_user_id::text AS uid FROM mention_index WHERE tx_id = $1 ORDER BY mentioned_user_id`,
      [ref.txId],
    );
    const indexed = indexRows.map((r: { uid: string }) => r.uid).sort();
    expect(indexed).to.deep.equal([soft.userId, target.userId].sort());

    // Feed carries mentions metadata; tokens preserved in title/body.
    const feed = await w.app.inject({ method: "GET", url: "/v1/public/feed" });
    expect(feed.statusCode).to.equal(200);
    const item = (feed.json() as { items: any[] }).items.find((i) => i.id === author.threadId);
    expect(item).to.exist;
    expect(item.title).to.include(relatedToken);
    expect(item.body.join("\n\n")).to.include(relatedToken);
    expect(item.mentions[nodeId].kind).to.equal("profile"); // target joined + public visibility
    // Profile chips show wire handle (compose-consistent), not display name.
    const targetUser = await w.services.repos.user.getById(target.userId);
    expect(item.mentions[nodeId].display).to.equal(targetUser!.handle);
    expect(item.mentions[nodeId].route).to.equal(`/profile/${targetUser!.handle}`);
    expect(item.mentions[someoneNode].display).to.equal("Someone");
    expect(item.mentions[someoneNode].kind).to.equal("reserved");
    expect(item.mentions[softNode].kind).to.equal("reserved");
    expect(item.mentions[softNode].display).to.not.equal("Someone");

    // After soft user joins (account still anonymous-default), same node resolves as persona.
    const softPasskey = new DevPasskeyConnector({
      rootDir: mkdtempSync(join(tmpdir(), "oursay-mention-soft-")),
      seed: "soft",
    });
    await softPasskey.enrollDevice({ userId: soft.userId, deviceId: "A", label: "phone" });
    const softSess = new IdentitySession(await softPasskey.unlock({ userId: soft.userId, deviceId: "A" }));
    const softClient = new CivicHttpClient({
      baseUrl: "http://localhost",
      session: softSess,
      token: soft.token,
      fetch: injectFetch(w.app),
    });
    await softClient.ensureJoined(author.t);
    // Soft was public for relate; flip to anonymous so out-of-scope viewers see persona not profile.
    await w.services.repos.profile.setVisibility(soft.userId, "anonymous");

    const feed2 = await w.app.inject({ method: "GET", url: "/v1/public/feed" });
    const item2 = (feed2.json() as { items: any[] }).items.find((i) => i.id === author.threadId);
    expect(item2.mentions[softNode].kind).to.equal("persona");
  });

  it("plain-text @handle appends without tokens or index", async () => {
    const author = await enrolledMember(w, "plain-handle@example.com", "plain");
    const ref = await author.client.createPost(author.t, { title: "No tokens", body: "Thanks @alice" });
    const { rows } = await w.db.pool.query(`SELECT 1 FROM mention_index WHERE tx_id = $1`, [ref.txId]);
    expect(rows).to.have.length(0);

    const feed = await w.app.inject({ method: "GET", url: "/v1/public/feed" });
    const item = (feed.json() as { items: any[] }).items.find((i) => i.id === author.threadId);
    expect(item.mentions).to.equal(undefined);
    expect(item.body).to.deep.equal(["Thanks @alice"]);
  });

  it("in-thread persona candidate always relates", async () => {
    const author = await enrolledMember(w, "persona-author@example.com", "pa");
    const other = await enrolledMember(w, "persona-other@example.com", "po", author.threadId);
    await w.services.repos.profile.setVisibility(other.userId, "anonymous"); // profile-@ would fail
    const personaName = other.client.personaDisplayName(author.t)!;
    expect(personaName).to.be.a("string");

    const intent: Intent = {
      op: "create",
      type: "post",
      entityId: author.threadId,
      content: { title: "t", body: "b" },
    };
    const prep = await author.client.prepare(author.t, intent, [{ kind: "persona", personaName }]);
    expect(prep.mentionNodes![0]!.userId).to.equal(other.userId);
  });
});

describe("37b mention nodes: Mentions tabs visibility (Slice 4)", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  async function profileMentions(handle: string, token?: string) {
    return w.app.inject({
      method: "GET",
      url: `/v1/public/profiles/${encodeURIComponent(handle)}/mentions`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  it("keeps per-thread-anonymous cites off the profile Mentions tab (docs/09 §2 sever)", async () => {
    const target = await fullSessionAccount(w, "sever-target@example.com");
    await w.services.repos.profile.setVisibility(target.userId, "public");
    const targetUser = await w.services.repos.user.getById(target.userId);
    const handle = targetUser!.handle.replace(/^@/, "");

    const targetPasskey = new DevPasskeyConnector({
      rootDir: mkdtempSync(join(tmpdir(), "oursay-sev-t-")),
      seed: "sev-t",
    });
    await targetPasskey.enrollDevice({ userId: target.userId, deviceId: "A", label: "phone" });
    const targetSess = new IdentitySession(await targetPasskey.unlock({ userId: target.userId, deviceId: "A" }));
    const targetClient = new CivicHttpClient({
      baseUrl: "http://localhost",
      session: targetSess,
      token: target.token,
      fetch: injectFetch(w.app),
    });

    // Open thread: target joins (account public); related cite appears for strangers.
    const openCiter = await enrolledMember(w, "sever-open-citer@example.com", "sev-oc");
    await targetClient.ensureJoined(openCiter.t);
    await submitRelatedRootMention(openCiter, target.userId, "Open cite");

    // Masked thread: target joins then sets anonymous override; cite must not leak to strangers.
    const maskedCiter = await enrolledMember(w, "sever-masked-citer@example.com", "sev-mc");
    await targetClient.ensureJoined(maskedCiter.t);
    await w.services.recordStore.setThreadVisibility(target.userId, maskedCiter.threadId, "anonymous");
    await submitRelatedRootMention(maskedCiter, target.userId, "Sensitive cite");

    const stranger = await profileMentions(handle);
    expect(stranger.statusCode).to.equal(200, stranger.body);
    const strangerBody = stranger.json() as { items: Array<{ text: string; recordId?: string }> };
    expect(strangerBody.items.map((i) => i.recordId)).to.deep.equal([openCiter.threadId]);
    expect(JSON.stringify(strangerBody)).to.include("Open cite");
    expect(JSON.stringify(strangerBody)).to.not.include("Sensitive cite");

    const own = await profileMentions(handle, target.token);
    expect(own.statusCode).to.equal(200, own.body);
    const ownBody = own.json() as { items: Array<{ text: string }> };
    expect(JSON.stringify(ownBody)).to.include("Open cite");
    expect(JSON.stringify(ownBody)).to.include("Sensitive cite");
  });

  it("lists related soft-mode cites when account visibility reveals the mention", async () => {
    const soft = await fullSessionAccount(w, "soft-list@example.com");
    await w.services.repos.profile.setVisibility(soft.userId, "public");
    const softUser = await w.services.repos.user.getById(soft.userId);
    const handle = softUser!.handle.replace(/^@/, "");

    const citer = await enrolledMember(w, "soft-citer@example.com", "soft-c");
    await submitRelatedRootMention(citer, soft.userId, "Soft hello");

    const res = await profileMentions(handle);
    expect(res.statusCode).to.equal(200, res.body);
    const body = res.json() as { items: Array<{ text: string; recordId?: string }> };
    expect(body.items).to.have.length(1);
    expect(body.items[0]!.text).to.include("Soft hello");
    expect(body.items[0]!.recordId).to.equal(citer.threadId);
  });

  it("404 on Mentions when profile is out of scope; Someone and plain @handle never listed", async () => {
    const hidden = await enrolledMember(w, "hidden-mentions@example.com", "hid-m");
    await w.services.repos.profile.setVisibility(hidden.userId, "anonymous");
    const hiddenUser = await w.services.repos.user.getById(hidden.userId);
    const hiddenHandle = hiddenUser!.handle.replace(/^@/, "");

    // Root so a related persona cite can exist; stranger still 404s the account Mentions surface.
    const hiddenIntent: Intent = {
      op: "create",
      type: "post",
      entityId: hidden.threadId,
      content: { title: "Hidden root", body: "b" },
    };
    const hiddenPrep = await hidden.client.prepare(hidden.t, hiddenIntent);
    await hidden.client.submit(await hidden.sess.buildSigned(hidden.t, hiddenPrep, hiddenIntent));

    const citer = await enrolledMember(w, "hidden-citer@example.com", "hid-c", hidden.threadId);
    const personaName = hidden.client.personaDisplayName(hidden.t)!;
    await submitPersonaCommentMention(citer, hidden.threadId, personaName, "Persona cite");

    expect((await profileMentions(hiddenHandle)).statusCode).to.equal(404);

    // Public account with only unresolved Someone + plain @handle → empty Mentions tab.
    const publicTarget = await enrolledMember(w, "public-for-someone@example.com", "pub-s");
    await w.services.repos.profile.setVisibility(publicTarget.userId, "public");
    const publicUser = await w.services.repos.user.getById(publicTarget.userId);
    const publicHandle = publicUser!.handle.replace(/^@/, "");

    const rootIntent: Intent = {
      op: "create",
      type: "post",
      entityId: publicTarget.threadId,
      content: { title: "Public root", body: "Thanks @alice" },
    };
    const rootPrep = await publicTarget.client.prepare(publicTarget.t, rootIntent);
    await publicTarget.client.submit(
      await publicTarget.sess.buildSigned(publicTarget.t, rootPrep, rootIntent),
    );

    const anon = await enrolledMember(w, "anon-for-someone@example.com", "anon-s");
    await w.services.repos.profile.setVisibility(anon.userId, "anonymous");
    const someoneCiter = await enrolledMember(w, "someone-citer@example.com", "sm-c", publicTarget.threadId);
    const someoneIntent: Intent = {
      op: "create",
      type: "comment",
      entityId: randomUUID(),
      content: { body: "placeholder" },
      parent: { type: "post", id: publicTarget.threadId },
    };
    const prepSomeone = await someoneCiter.client.prepare(someoneCiter.t, someoneIntent, [
      { kind: "profile", userId: anon.userId },
    ]);
    expect(prepSomeone.mentionNodes![0]!.userId).to.equal(undefined);
    const someoneTok = buildMentionToken(prepSomeone.mentionNodes![0]!.nodeId);
    await someoneCiter.client.submit(
      await someoneCiter.sess.buildSigned(someoneCiter.t, prepSomeone, {
        ...someoneIntent,
        content: { body: `Hey ${someoneTok}` },
      }),
    );

    const listed = await profileMentions(publicHandle);
    expect(listed.statusCode).to.equal(200, listed.body);
    expect((listed.json() as { items: unknown[] }).items).to.have.length(0);
  });

  it("persona Mentions stay thread-scoped", async () => {
    const target = await enrolledMember(w, "persona-tab-t@example.com", "pt-t");
    await w.services.repos.profile.setVisibility(target.userId, "anonymous");
    const personaName = target.client.personaDisplayName(target.t)!;

    const rootIntent: Intent = {
      op: "create",
      type: "post",
      entityId: target.threadId,
      content: { title: "Root A", body: "b" },
    };
    const rootPrep = await target.client.prepare(target.t, rootIntent);
    await target.client.submit(await target.sess.buildSigned(target.t, rootPrep, rootIntent));

    const citerA = await enrolledMember(w, "persona-tab-a@example.com", "pt-a", target.threadId);
    await submitPersonaCommentMention(citerA, target.threadId, personaName, "ThreadA");

    const citerB = await enrolledMember(w, "persona-tab-b@example.com", "pt-b");
    await target.client.ensureJoined(citerB.t);
    const personaB = target.client.personaDisplayName(citerB.t)!;
    const rootB: Intent = {
      op: "create",
      type: "post",
      entityId: citerB.threadId,
      content: { title: "Root B", body: "b" },
    };
    const prepRootB = await citerB.client.prepare(citerB.t, rootB);
    await citerB.client.submit(await citerB.sess.buildSigned(citerB.t, prepRootB, rootB));
    await submitPersonaCommentMention(citerB, citerB.threadId, personaB, "ThreadB");

    const page = await w.app.inject({
      method: "GET",
      url: `/v1/public/personas/${encodeURIComponent(personaName)}`,
    });
    expect(page.statusCode).to.equal(200, page.body);
    const body = page.json() as { mentions: Array<{ text: string; recordId?: string }> };
    expect(body.mentions).to.have.length(1);
    expect(body.mentions[0]!.text).to.include("ThreadA");
    expect(body.mentions[0]!.recordId).to.equal(target.threadId);
    expect(JSON.stringify(body.mentions)).to.not.include("ThreadB");
  });
});
