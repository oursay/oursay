/**
 * Dev seed: stand up a realistic slice of the public record against the local stack, exercise
 * create / edit / react / vote / sign / govern / delete, then print the folded current state
 * and a chain-verification summary. Run with: `npm run seed --workspace public-record`
 * (after `npm run db:up --workspace public-record`).
 */
import { immudbPgConfig, pgConfig } from "../src/config.js";
import { PublicChain } from "../src/ledger/chain.js";
import { PgWireLedgerConnector } from "../src/ledger/pgwire.connector.js";
import { PrivateStore } from "../src/private/store.js";
import { getThread } from "../src/projection.js";
import { RecordService } from "../src/record.js";
import { verifyEntityChain } from "../src/verify.js";

function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

async function main(): Promise<void> {
  const connector = new PgWireLedgerConnector(immudbPgConfig);
  await connector.connect();
  const store = new PrivateStore(pgConfig);
  await store.init();
  await store.reset();
  const svc = new RecordService(new PublicChain(connector, store), store);

  console.log("\n=== seeding ===");

  // A belief (generic `post`), with discussion + reactions.
  const post = await svc.create({ type: "post", author: "alice", content: { title: "Bike lanes", body: "We should add protected bike lanes on Main St." } });
  const c1 = await svc.create({ type: "comment", author: "bob", content: { body: "Agreed — safer for everyone." }, parent: { type: "post", id: post.entityId } });
  await svc.create({ type: "comment", author: "carol", content: { body: "What about parking?" }, parent: { type: "comment", id: c1.entityId } });
  await svc.react("bob", { type: "post", id: post.entityId }, "check");
  await svc.react("carol", { type: "post", id: post.entityId }, "check");
  await svc.react("dave", { type: "post", id: post.entityId }, "cross");
  // dave changes his mind:
  await svc.react("dave", { type: "post", id: post.entityId }, "check");

  // A petition that permits revocation before a deadline.
  const petition = await svc.create({
    type: "petition",
    author: "alice",
    content: { title: "Repave Main St.", text: "Petition the council to repave Main St.", rules: { region: "ward-3", allowRevoke: true, deadline: isoFromNow(7 * 24 * 3600_000) } },
  });
  await svc.sign("bob", petition.entityId, "Long overdue.");
  await svc.sign("carol", petition.entityId);
  await svc.sign("dave", petition.entityId);
  await svc.revoke("dave", petition.entityId);

  // A poll that permits changing a vote before close.
  const poll = await svc.create({
    type: "poll",
    author: "alice",
    content: { question: "Should Main St. get bike lanes?", options: ["yes", "no", "abstain"], rules: { region: "ward-3", allowChange: true, deadline: isoFromNow(3 * 24 * 3600_000) } },
  });
  await svc.vote("bob", poll.entityId, "yes");
  await svc.vote("carol", poll.entityId, "no");
  await svc.vote("dave", poll.entityId, "no");
  await svc.changeVote("dave", poll.entityId, "yes"); // dave switches

  // Revision pinning: edit the post AFTER it gathered support.
  const edited = await svc.update({ entityId: post.entityId, author: "alice", content: { title: "Bike lanes", body: "We should add protected bike lanes on Main St. AND 1st Ave." } });

  // A throwaway post that gets deleted.
  const doomed = await svc.create({ type: "post", author: "carol", content: { body: "duplicate — will delete" } });
  await svc.delete({ entityId: doomed.entityId, author: "carol" });

  // ── Report ────────────────────────────────────────────────────────────────────────────
  console.log("\n=== folded state ===");
  const thread = await getThread(store, post.entityId);
  console.log("post:", JSON.stringify((thread!.root.content as { body: string }).body));
  console.log("post reactions (entity-pinned):", thread!.reactionsByEntity);
  console.log("post reactions (current revision):", thread!.reactionsByCurrentRevision, "← edit reset current-revision support");
  console.log("reactions still pinned to the ORIGINAL revision:", await store.getReactionCountsByRevision(post.txHash));
  console.log("comments:", thread!.comments.length, "top-level;", thread!.comments[0]?.replies.length ?? 0, "reply(ies)");
  console.log("poll results:", await store.getPollResults(poll.entityId));
  console.log("petition signatures (active):", await store.getPetitionSignatureCount(petition.entityId));
  console.log("deleted post is tombstoned:", (await store.getEntityState(doomed.entityId))!.isDeleted);
  void edited;

  console.log("\n=== chain verification ===");
  for (const [label, id] of [["post", post.entityId], ["poll", poll.entityId], ["petition", petition.entityId]] as const) {
    const report = await verifyEntityChain(store, connector, id);
    console.log(`${label}: ${report.ok ? "OK" : "FAILED"} (${report.verdicts.length} tx)`);
  }

  await connector.close();
  await store.close();
  console.log("\ndone.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
