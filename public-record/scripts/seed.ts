/**
 * Dev seed: stand up a realistic slice of the public record against the local stack, exercise
 * create / edit / react / vote / sign / govern / delete, then print the folded current state
 * and a chain-verification summary. Run with: `npm run seed --workspace public-record`
 * (after `npm run db:up --workspace public-record`).
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BundleAssembler } from "../src/anchor/assembler.js";
import { AnchorPublisher } from "../src/anchor/publisher.js";
import { FileAnchorTarget } from "../src/anchor/file.target.js";
import { everyNBlocks } from "../src/anchor/target.js";
import { verifyChain } from "../src/anchor/verify.js";
import { blockConfig, immudbPgConfig, pgConfig } from "../src/config.js";
import { PublicChain } from "../src/ledger/chain.js";
import { PgWireLedgerConnector } from "../src/ledger/pgwire.connector.js";
import { BlockSettler } from "../src/ledger/settler.js";
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
  const chainId = randomUUID(); // fresh genesis per seed run (immudb is never reset)
  const svc = new RecordService(new PublicChain(store, chainId), store);

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
    content: { title: "Repave Main St.", text: "Petition the council to repave Main St.", rules: { appliesToDistrictIds: ["edmonton-ward-3-2026"], allowRevoke: true, deadline: isoFromNow(7 * 24 * 3600_000) } },
  });
  await svc.sign("bob", petition.entityId, "Long overdue.");
  await svc.sign("carol", petition.entityId);
  await svc.sign("dave", petition.entityId);
  await svc.revoke("dave", petition.entityId);

  // A poll that permits changing a vote before close. Its geographic stake uses the canonical
  // appliesToRegion RegionRef (the stable district slug) — the petition above keeps the deprecated
  // appliesToDistrictIds alias, so the seed exercises both forms.
  const poll = await svc.create({
    type: "poll",
    author: "alice",
    content: { question: "Should Main St. get bike lanes?", options: ["yes", "no", "abstain"], rules: { appliesToRegion: "district:edmonton-ward-3", allowChange: true, deadline: isoFromNow(3 * 24 * 3600_000) } },
  });
  await svc.vote("bob", poll.entityId, "yes");
  await svc.vote("carol", poll.entityId, "no");
  await svc.vote("dave", poll.entityId, "no");
  await svc.changeVote("dave", poll.entityId, "yes"); // dave switches

  // Revision pinning: edit the post AFTER it gathered support.
  const edited = await svc.update({ entityId: post.entityId, author: "alice", content: { title: "Bike lanes", body: "We should add protected bike lanes on Main St. AND 1st Ave." } });

  // A throwaway post that gets deleted.
  const doomed = await svc.create({ type: "post", author: "carol", content: { title: "Test post", body: "duplicate — will delete" } });
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

  // ── Settlement: drain the pool into block(s) on the append-only chain ────────────────────
  console.log("\n=== settlement ===");
  const settler = new BlockSettler(store, connector, chainId, blockConfig);
  const headers = await settler.flushPendingSettlement();
  console.log(`settled ${headers.length} block(s) on chain ${chainId}`);
  for (const h of headers) {
    console.log(
      `  block ${h.blockHeight}: seq (${h.fromSeq}, ${h.toSeq}], ${h.txCount} tx,` +
        ` root ${h.bundleMerkleRoot.slice(0, 12)}…, tip ${h.chainTipHash.slice(0, 12)}…`,
    );
  }

  // ── External anchoring: publish the settled blocks to a file target, then verify offline ──
  console.log("\n=== external anchoring ===");
  const anchorDir = mkdtempSync(join(tmpdir(), "oursay-seed-anchor-"));
  const target = new FileAnchorTarget(anchorDir, everyNBlocks(1));
  const publisher = new AnchorPublisher(connector, new BundleAssembler(store), chainId);
  const published = await publisher.publish(target);
  console.log(`published block(s) ${JSON.stringify(published)} to ${anchorDir}`);
  const chain = verifyChain(await target.listAnchors());
  console.log(`offline chain verify: ${chain.ok ? "OK" : "FAILED"} (tip ${chain.tipHash?.slice(0, 12)}…)`);

  console.log("\n=== chain verification (per entity) ===");
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
