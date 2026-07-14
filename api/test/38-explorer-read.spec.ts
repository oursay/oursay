// Explorer / auditor READ surface (docs/11 §8 interim): chain tip, blocks, txs?block=, tx/:id.
// Golden path: civic submit → BlockSettler.flush → unauthenticated explorer GETs.
// Redaction: salt+content withheld together; hashes / envelope remain.

import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";

process.env.OURSAY_DEV_PASSKEY = "1";

import { encodeUuidV4Base59, decodeUuidV4Base59 } from "@oursay/encode";
import { CivicHttpClient, DevPasskeyConnector, IdentitySession } from "@oursay/identity/client";
import type { ThreadRef } from "@oursay/identity";
import {
  BlockSettler,
  blockConfig,
  computeChainTipHash,
  contentCommitment,
  hashLeaf,
  merkleRoot,
  registerJurisdiction,
  txHashOf,
  verifyEnvelope,
  type JurisdictionGates,
  type TxEnvelope,
} from "@oursay/public-record";
import { civicConfig } from "../src/config.js";
import { injectFetch } from "./helpers/inject-fetch.js";
import { resetWorld, type World } from "./helpers/world.js";
import { fullSessionAccount } from "./helpers/account.js";

const JURISDICTION = "test-38-explorer";
const PASSKEY_ALL = Object.fromEntries(
  ["post", "petition", "poll", "result", "comment", "reaction", "vote", "petition_signature"].map((a) => [
    a,
    { act: "anyone", signMin: "passkey" },
  ]),
) as JurisdictionGates;
registerJurisdiction({ id: JURISDICTION, level: "test", rules: {}, gates: PASSKEY_ALL });

const CHAIN_ID = civicConfig.chainId;

async function enrolledPoster(w: World, email: string, seed: string) {
  const { userId, token } = await fullSessionAccount(w, email);
  const passkey = new DevPasskeyConnector({ rootDir: mkdtempSync(join(tmpdir(), "oursay-explorer-")), seed });
  await passkey.enrollDevice({ userId, deviceId: "A", label: "phone A" });
  const sess = new IdentitySession(await passkey.unlock({ userId, deviceId: "A" }));
  const threadId = randomUUID();
  const t: ThreadRef = { threadId, jurisdiction: JURISDICTION };
  const client = new CivicHttpClient({
    baseUrl: "http://localhost",
    session: sess,
    token,
    fetch: injectFetch(w.app),
  });
  await client.ensureJoined(t);
  return { client, t, threadId };
}

async function settleChain(w: World) {
  await w.services.connectLedger();
  const settler = new BlockSettler(w.services.recordStore, w.services.ledger, CHAIN_ID, blockConfig);
  return settler.flushPendingSettlement();
}

/** Post once and settle; returns the settled block height for this flush. */
async function settleOnePost(
  w: World,
  email: string,
  seed: string,
  content: { title: string; body: string },
): Promise<number> {
  const m = await enrolledPoster(w, email, seed);
  await m.client.createPost(m.t, content);
  const headers = await settleChain(w);
  expect(headers.length).to.be.greaterThan(0);
  return headers[headers.length - 1]!.blockHeight;
}

type ExplorerBlock = {
  height: number;
  txCount: number;
  fromSeq: number;
  toSeq: number;
  bundleMerkleRoot: string;
  chainTipHash: string;
  prevChainTipHash: string | null;
  prevBlockRoot: string | null;
  immudbRoot: { db: string; txHashHex: string; txId: number };
};

type ExplorerTx = {
  seq: number;
  envelope: string;
  txHash: string;
  contentHash: string;
  salt: string | null;
  content: unknown;
  withheld: boolean;
};

async function getExplorerBlock(w: World, height: number): Promise<ExplorerBlock> {
  const res = await w.app.inject({ method: "GET", url: `/v1/explorer/${CHAIN_ID}/blocks/${height}` });
  expect(res.statusCode).to.equal(200);
  return res.json() as ExplorerBlock;
}

async function getExplorerBlockTxs(w: World, height: number): Promise<ExplorerTx[]> {
  const res = await w.app.inject({ method: "GET", url: `/v1/explorer/${CHAIN_ID}/txs?block=${height}` });
  expect(res.statusCode).to.equal(200);
  return (res.json() as { items: ExplorerTx[] }).items;
}

describe("38 explorer read: chain / blocks / txs / tx", () => {
  let w: World;
  beforeEach(async () => {
    w = await resetWorld();
  });

  it("lists chain tip, block, block txs, and one tx after settlement", async () => {
    const m = await enrolledPoster(w, "explorer-golden@example.com", "explorer-golden");
    const ref = await m.client.createPost(m.t, { title: "Explorer post", body: "audit me" });
    const headers = await settleChain(w);
    expect(headers.length).to.be.greaterThan(0);
    const settledHeight = headers[headers.length - 1]!.blockHeight;

    const chainRes = await w.app.inject({ method: "GET", url: `/v1/explorer/${CHAIN_ID}` });
    expect(chainRes.statusCode).to.equal(200);
    const chain = chainRes.json();
    expect(chain.chainId).to.equal(CHAIN_ID);
    expect(chain.status).to.equal("active");
    expect(chain.tipHeight).to.be.a("number");
    expect(chain.tipHeight).to.be.at.least(settledHeight);
    expect(chain.typeCounts.post).to.be.at.least(1);
    expect(chain.pendingTxCount).to.equal(0);

    const blocksRes = await w.app.inject({
      method: "GET",
      url: `/v1/explorer/${CHAIN_ID}/blocks?limit=5`,
    });
    expect(blocksRes.statusCode).to.equal(200);
    const blocks = blocksRes.json();
    expect(blocks.items.length).to.be.greaterThan(0);
    expect(blocks.items[0].height).to.equal(blocks.tipHeight);
    expect(blocks.items.some((b: { height: number }) => b.height === settledHeight)).to.equal(true);

    const blockRes = await w.app.inject({
      method: "GET",
      url: `/v1/explorer/${CHAIN_ID}/blocks/${settledHeight}`,
    });
    expect(blockRes.statusCode).to.equal(200);
    const block = blockRes.json();
    expect(block.height).to.equal(settledHeight);
    expect(block.status).to.equal("settled");
    expect(block.typeCounts.post).to.be.at.least(1);
    expect(block.bundleMerkleRoot).to.be.a("string");

    const txsRes = await w.app.inject({
      method: "GET",
      url: `/v1/explorer/${CHAIN_ID}/txs?block=${settledHeight}`,
    });
    expect(txsRes.statusCode).to.equal(200);
    const txs = txsRes.json();
    expect(txs.blockHeight).to.equal(settledHeight);
    expect(txs.items.length).to.be.greaterThan(0);
    const postTx = txs.items.find((t: { type: string; entityId: string }) => t.type === "post");
    expect(postTx, "settled post tx").to.not.equal(undefined);
    expect(postTx.content).to.deep.equal({ title: "Explorer post", body: "audit me" });
    expect(postTx.salt).to.be.a("string").and.not.empty;
    expect(postTx.withheld).to.equal(false);
    expect(postTx.status).to.equal("settled");
    expect(postTx.txId).to.equal(encodeUuidV4Base59(ref.txId));

    const txRes = await w.app.inject({
      method: "GET",
      url: `/v1/explorer/${CHAIN_ID}/tx/${postTx.txId}`,
    });
    expect(txRes.statusCode).to.equal(200);
    const tx = txRes.json();
    expect(tx.txId).to.equal(postTx.txId);
    expect(tx.blockHeight).to.equal(settledHeight);
    expect(tx.contentHash).to.be.a("string");

    // UUID form also accepted.
    const txUuidRes = await w.app.inject({
      method: "GET",
      url: `/v1/explorer/${CHAIN_ID}/tx/${ref.txId}`,
    });
    expect(txUuidRes.statusCode).to.equal(200);
    expect(txUuidRes.json().txId).to.equal(postTx.txId);
  });

  it("withholds salt+content after redact; hashes stay", async () => {
    const m = await enrolledPoster(w, "explorer-redact@example.com", "explorer-redact");
    const ref = await m.client.createPost(m.t, { title: "Secret", body: "redact me" });
    await settleChain(w);
    await w.services.recordStore.redact(ref.txId);

    const txRes = await w.app.inject({
      method: "GET",
      url: `/v1/explorer/${CHAIN_ID}/tx/${encodeUuidV4Base59(ref.txId)}`,
    });
    expect(txRes.statusCode).to.equal(200);
    const tx = txRes.json();
    expect(tx.withheld).to.equal(true);
    expect(tx.isRedacted).to.equal(true);
    expect(tx.salt).to.equal(null);
    expect(tx.content).to.equal(null);
    expect(tx.contentHash).to.be.a("string").and.not.empty;
    expect(tx.envelope).to.be.a("string").and.not.empty;
  });

  it("auditor can recompute contentHash and verify envelope from tx endpoint", async () => {
    const m = await enrolledPoster(w, "explorer-verify@example.com", "explorer-verify");
    const ref = await m.client.createPost(m.t, {
      title: "Verify me",
      body: "salt+content must reproduce the commitment",
    });
    await settleChain(w);

    const txRes = await w.app.inject({
      method: "GET",
      url: `/v1/explorer/${CHAIN_ID}/tx/${encodeUuidV4Base59(ref.txId)}`,
    });
    expect(txRes.statusCode).to.equal(200);
    const tx = txRes.json();
    expect(tx.withheld).to.equal(false);
    expect(tx.salt).to.be.a("string").and.not.empty;
    expect(tx.content).to.deep.equal({
      title: "Verify me",
      body: "salt+content must reproduce the commitment",
    });

    // Storage id is UUID; explorer returns Base59 — commitment uses the UUID (as at append time).
    const txIdUuid = decodeUuidV4Base59(tx.txId);
    expect(txIdUuid).to.equal(ref.txId);
    expect(contentCommitment({ id: txIdUuid, salt: tx.salt, content: tx.content })).to.equal(tx.contentHash);

    const env = JSON.parse(tx.envelope) as TxEnvelope;
    expect(env.txId).to.equal(ref.txId);
    expect(env.contentHash).to.equal(tx.contentHash);
    expect(verifyEnvelope(env), "envelope signature / WebAuthn assertion").to.equal(true);
    expect(txHashOf(env)).to.equal(tx.txHash);
  });

  it("auditor can recompute block merkle root from txs?block=N", async () => {
    const height = await settleOnePost(w, "explorer-merkle@example.com", "explorer-merkle", {
      title: "Merkle",
      body: "rebuild root from explorer txs",
    });
    const block = await getExplorerBlock(w, height);
    const txs = await getExplorerBlockTxs(w, height);

    expect(txs.length).to.equal(block.txCount);
    expect(txs.map((t) => t.seq)).to.deep.equal([...txs].sort((x, y) => x.seq - y.seq).map((t) => t.seq));
    expect(txs[0]!.seq).to.be.greaterThan(block.fromSeq);
    expect(txs[txs.length - 1]!.seq).to.equal(block.toSeq);

    for (const t of txs) {
      expect(hashLeaf(t.envelope)).to.equal(t.txHash);
      const env = JSON.parse(t.envelope) as TxEnvelope;
      expect(verifyEnvelope(env)).to.equal(true);
      if (!t.withheld) {
        expect(t.salt).to.be.a("string");
        expect(contentCommitment({ id: env.txId, salt: t.salt!, content: t.content })).to.equal(t.contentHash);
      }
    }

    expect(merkleRoot(txs.map((t) => hashLeaf(t.envelope)))).to.equal(block.bundleMerkleRoot);
  });

  it("auditor can verify chainTipHash fold on a block header", async () => {
    const height = await settleOnePost(w, "explorer-tip-fold@example.com", "explorer-tip-fold", {
      title: "Tip fold",
      body: "prev tip ‖ merkle root",
    });
    const block = await getExplorerBlock(w, height);
    expect(computeChainTipHash(block.prevChainTipHash, block.bundleMerkleRoot)).to.equal(block.chainTipHash);
  });

  it("auditor can verify tip fold from GET /v1/explorer/:chainId alone", async () => {
    await settleOnePost(w, "explorer-chain-tip-fold@example.com", "explorer-chain-tip-fold", {
      title: "Chain tip fold",
      body: "tip carries prevChainTipHash + immudbRoot",
    });
    const chainRes = await w.app.inject({ method: "GET", url: `/v1/explorer/${CHAIN_ID}` });
    expect(chainRes.statusCode).to.equal(200);
    const { tip } = chainRes.json();
    expect(tip).to.not.equal(null);
    expect(computeChainTipHash(tip.prevChainTipHash, tip.bundleMerkleRoot)).to.equal(tip.chainTipHash);
    expect(tip.immudbRoot).to.include.keys("db", "txId", "txHashHex");
  });

  it("auditor can verify consecutive block link from /blocks/:height", async () => {
    // Two settlements → two linked headers (immudb keeps prior history; we only check these two).
    const heightA = await settleOnePost(w, "explorer-link-a@example.com", "explorer-link-a", {
      title: "Link A",
      body: "first",
    });
    const heightB = await settleOnePost(w, "explorer-link-b@example.com", "explorer-link-b", {
      title: "Link B",
      body: "second",
    });
    expect(heightB).to.equal(heightA + 1);

    const blockA = await getExplorerBlock(w, heightA);
    const blockB = await getExplorerBlock(w, heightB);

    // Publish prevAnchorHash is not on the explorer DTO — check header link fields only.
    expect(blockB.height).to.equal(blockA.height + 1);
    expect(blockB.fromSeq).to.equal(blockA.toSeq);
    expect(blockB.prevBlockRoot).to.equal(blockA.bundleMerkleRoot);
    expect(blockB.prevChainTipHash).to.equal(blockA.chainTipHash);
  });

  it("chain tip and /blocks list agree with the tip block", async () => {
    const height = await settleOnePost(w, "explorer-tip-agree@example.com", "explorer-tip-agree", {
      title: "Tip agree",
      body: "chain vs blocks",
    });
    const tipBlock = await getExplorerBlock(w, height);

    const chainRes = await w.app.inject({ method: "GET", url: `/v1/explorer/${CHAIN_ID}` });
    expect(chainRes.statusCode).to.equal(200);
    const chain = chainRes.json();
    expect(chain.tipHeight).to.equal(height);
    expect(chain.tip.chainTipHash).to.equal(tipBlock.chainTipHash);
    expect(chain.tip.bundleMerkleRoot).to.equal(tipBlock.bundleMerkleRoot);
    expect(chain.tip.prevChainTipHash).to.equal(tipBlock.prevChainTipHash);
    expect(chain.tip.prevBlockRoot).to.equal(tipBlock.prevBlockRoot);
    expect(chain.tip.immudbRoot).to.deep.equal(tipBlock.immudbRoot);

    const blocksRes = await w.app.inject({
      method: "GET",
      url: `/v1/explorer/${CHAIN_ID}/blocks?limit=1`,
    });
    expect(blocksRes.statusCode).to.equal(200);
    const listed = blocksRes.json();
    expect(listed.tipHeight).to.equal(height);
    expect(listed.items[0].height).to.equal(height);
    expect(listed.items[0].chainTipHash).to.equal(tipBlock.chainTipHash);
  });

  it("returns 404 for missing block and 400 for bad tx id", async () => {
    const missing = await w.app.inject({
      method: "GET",
      url: `/v1/explorer/${CHAIN_ID}/blocks/999999999`,
    });
    expect(missing.statusCode).to.equal(404);

    const badTx = await w.app.inject({
      method: "GET",
      url: `/v1/explorer/${CHAIN_ID}/tx/%%%not-valid%%%`,
    });
    expect(badTx.statusCode).to.equal(400);

    const emptyChain = await w.app.inject({
      method: "GET",
      url: `/v1/explorer/never-settled-chain-${randomUUID()}`,
    });
    expect(emptyChain.statusCode).to.equal(200);
    expect(emptyChain.json().status).to.equal("empty");
    expect(emptyChain.json().tipHeight).to.equal(null);
  });
});
