// Explorer / auditor READ surface (docs/11 §8 interim): chain tip, blocks, txs?block=, tx/:id.
// Golden path: civic submit → BlockSettler.flush → unauthenticated explorer GETs.
// Redaction: salt+content withheld together; hashes / envelope remain.

import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";

process.env.OURSAY_DEV_PASSKEY = "1";

import { encodeUuidV4Base59 } from "@oursay/encode";
import { CivicHttpClient, DevPasskeyConnector, IdentitySession } from "@oursay/identity/client";
import type { ThreadRef } from "@oursay/identity";
import {
  BlockSettler,
  blockConfig,
  registerJurisdiction,
  type JurisdictionGates,
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
