// Mention map allocate / index projection (docs/entities/civic-identity/mention-node.md).

import { randomUUID } from "node:crypto";
import { expect } from "chai";
import { getWorld } from "./helpers/world.js";

describe("19 mention-map allocate + index", () => {
  it("allocateOrGet is idempotent per (thread, user) and mints a non-Someone reserved label", async () => {
    const { store } = await getWorld();
    await store.reset();
    const userId = randomUUID();
    const threadId = randomUUID();
    await store.putUser({ id: userId, handle: `@u${userId.slice(0, 8)}` });

    const a = await store.allocateOrGet(threadId, userId);
    const b = await store.allocateOrGet(threadId, userId);
    expect(b.nodeId).to.equal(a.nodeId);
    expect(b.reservedLabel).to.equal(a.reservedLabel);
    expect(a.reservedLabel).to.not.equal("Someone");

    const map = await store.getMentionMapByNodeIds([a.nodeId]);
    expect(map.get(a.nodeId)?.mentionedUserId).to.equal(userId);
    expect(map.get(a.nodeId)?.reservedLabel).to.equal(a.reservedLabel);
  });

  it("allocateUnresolved stores NULL user and Someone; multiple NULLs allowed", async () => {
    const { store } = await getWorld();
    await store.reset();
    const threadId = randomUUID();

    const a = await store.allocateUnresolved(threadId);
    const b = await store.allocateUnresolved(threadId);
    expect(a.nodeId).to.not.equal(b.nodeId);

    const map = await store.getMentionMapByNodeIds([a.nodeId, b.nodeId]);
    expect(map.get(a.nodeId)?.mentionedUserId).to.equal(null);
    expect(map.get(a.nodeId)?.reservedLabel).to.equal("Someone");
    expect(map.get(b.nodeId)?.mentionedUserId).to.equal(null);
  });

  it("distinct users in one thread get distinct related nodes", async () => {
    const { store } = await getWorld();
    await store.reset();
    const threadId = randomUUID();
    const u1 = randomUUID();
    const u2 = randomUUID();
    await store.putUser({ id: u1, handle: `@a${u1.slice(0, 8)}` });
    await store.putUser({ id: u2, handle: `@b${u2.slice(0, 8)}` });

    const a = await store.allocateOrGet(threadId, u1);
    const b = await store.allocateOrGet(threadId, u2);
    expect(a.nodeId).to.not.equal(b.nodeId);
  });

  it("insertMentionIndex is idempotent per (tx, mentioned user)", async () => {
    const { store } = await getWorld();
    await store.reset();
    const userId = randomUUID();
    const threadId = randomUUID();
    const txId = randomUUID();
    await store.putUser({ id: userId, handle: `@u${userId.slice(0, 8)}` });

    await store.insertMentionIndex([
      { txId, entityId: threadId, mentionedUserId: userId },
      { txId, entityId: threadId, mentionedUserId: userId },
    ]);
    // Second call must not throw (ON CONFLICT DO NOTHING).
    await store.insertMentionIndex([{ txId, entityId: threadId, mentionedUserId: userId }]);
  });

  it("listMentionsForUser joins record_tx via tx_id cast and filters by entityId", async () => {
    const { store, svc } = await getWorld();
    await store.reset();
    const userId = randomUUID();
    await store.putUser({ id: userId, handle: `@u${userId.slice(0, 8)}` });

    const threadA = await svc.create({
      type: "post",
      author: "pk-list-a",
      content: { title: "Thread A", body: "mention me" },
    });
    const threadB = await svc.create({
      type: "post",
      author: "pk-list-b",
      content: { title: "Thread B", body: "other" },
    });
    const comment = await svc.create({
      type: "comment",
      author: "pk-list-c",
      content: { body: "hi @target" },
      parent: { type: "post", id: threadA.entityId },
    });

    await store.insertMentionIndex([
      { txId: comment.txId, entityId: threadA.entityId, mentionedUserId: userId },
      { txId: threadB.txId, entityId: threadB.entityId, mentionedUserId: userId },
    ]);

    const all = await store.listMentionsForUser(userId, { limit: 10 });
    expect(all).to.have.length(2);
    expect(all.map((r) => r.entityId).sort()).to.deep.equal(
      [threadA.entityId, threadB.entityId].sort(),
    );
    expect(all.find((r) => r.entityId === threadA.entityId)?.citingEntityId).to.equal(comment.entityId);
    expect(all.find((r) => r.entityId === threadA.entityId)?.citingType).to.equal("comment");

    const scoped = await store.listMentionsForUser(userId, {
      entityId: threadA.entityId,
      limit: 10,
    });
    expect(scoped).to.have.length(1);
    expect(scoped[0]!.entityId).to.equal(threadA.entityId);
    expect(scoped[0]!.citingContent).to.deep.include({ body: "hi @target" });
  });
});
