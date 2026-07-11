// Mention nodes Slice 2: prepare allocate, submit mention_index, read mentions metadata
// (docs/entities/civic-identity/mention-node.md; docs/temp/MENTION-NODES-SLICE2-HANDOFF.md).

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
