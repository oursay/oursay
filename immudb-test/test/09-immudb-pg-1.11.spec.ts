import { randomUUID } from "node:crypto";
import { expect } from "chai";
import { immudbPgConfig } from "../src/config.js";
import { ImmudbPgLedger } from "../src/immudb-pg.js";
import { contentCommitment, newSalt, canonicalJson } from "../src/commitment.js";
import { hashLeaf, merkleProof, merkleRoot, verifyMerkleProof } from "../src/merkle.js";
import type { PublicEnvelope, RecordType } from "../src/types.js";

/**
 * The "reach up to the latest server" spike: immudb 1.11.0 over the PostgreSQL wire
 * protocol with a plain `pg` client, using native SQL verification functions. This is
 * the modern alternative to the (version-pinned, unmaintained) gRPC client in suites 01-08.
 */
function makeEnvelope(type: RecordType, authorRef: string, content: unknown) {
  const id = randomUUID();
  const salt = newSalt();
  const envelope: PublicEnvelope = {
    v: 1,
    type,
    id,
    authorRef,
    createdAt: new Date().toISOString(),
    contentHash: contentCommitment({ id, salt, content }),
  };
  return { envelope, salt, content };
}

describe("09 immudb 1.11.0 over pg-wire: native SQL verification @pgwire", () => {
  let ledger: ImmudbPgLedger;

  before(async () => {
    ledger = new ImmudbPgLedger(immudbPgConfig);
    await ledger.connect();
  });

  after(async () => {
    await ledger?.close();
  });

  it("writes a commitment envelope and reads it back (no plaintext in immudb)", async () => {
    const { envelope } = makeEnvelope("post", "alice", { text: "civic post over pg-wire" });
    await ledger.appendEnvelope(envelope);

    const got = await ledger.getEnvelope(envelope.id);
    expect(got, "row present").to.exist;
    expect(got!.contentHash).to.equal(envelope.contentHash);
    expect(JSON.stringify(got)).to.not.include("civic post");
  });

  it("exposes a cryptographic root via immudb_state() to anchor", async () => {
    const st = await ledger.state();
    expect(st.txId).to.be.greaterThan(0);
    expect(st.txHashHex).to.match(/^[0-9a-f]{64}$/);
  });

  it("verifies a row server-side via immudb_verify_row() on the latest server", async () => {
    const { envelope } = makeEnvelope("comment", "bob", { text: "verify me" });
    await ledger.appendEnvelope(envelope);

    const v = await ledger.verifyRow(envelope.id);
    expect(v.verified, "immudb_verify_row reports verified").to.equal(true);
    expect(v.tableName).to.equal("public_ledger");
    expect(v.txId).to.be.greaterThan(0);
  });

  it("supports parameterized (extended-protocol) writes for all five types", async () => {
    for (const t of ["post", "reaction", "comment", "poll", "vote"] as RecordType[]) {
      const { envelope } = makeEnvelope(t, "carol", { v: t });
      await ledger.appendEnvelope(envelope);
      const back = await ledger.getEnvelope(envelope.id);
      expect(back!.type).to.equal(t);
    }
  });

  it("the external Merkle anchoring layer is source-agnostic (works on pg-wire envelopes)", async () => {
    const envs = [
      makeEnvelope("post", "alice", { text: "A" }).envelope,
      makeEnvelope("vote", "bob", { option: "yes" }).envelope,
      makeEnvelope("comment", "carol", { text: "C" }).envelope,
    ];
    for (const e of envs) await ledger.appendEnvelope(e);

    // Same anchoring primitives as the gRPC path: hash envelopes -> Merkle root + proofs.
    const leaves = envs.map((e) => hashLeaf(canonicalJson(e)));
    const root = merkleRoot(leaves);
    for (let i = 0; i < envs.length; i++) {
      expect(verifyMerkleProof(leaves[i], merkleProof(leaves, i), root)).to.equal(true);
    }
    // A tampered envelope no longer matches its anchored leaf.
    const tampered = { ...envs[0], authorRef: "mallory" };
    expect(hashLeaf(canonicalJson(tampered))).to.not.equal(leaves[0]);
  });
});
