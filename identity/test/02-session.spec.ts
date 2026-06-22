// IdentitySession (no DB): persona/signer/nullifier derivation agrees with public-record, and
// buildSigned produces an author=persona / signer=thread-scoped device key envelope that verifies.
import { expect } from "chai";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  deriveDeviceThreadSigner,
  deriveNullifierSecret,
  deriveThreadKey,
  threadNullifier,
  verifyEnvelope,
} from "@oursay/public-record";
import { DevPasskeyConnector } from "../src/client/dev-connector.js";
import { IdentitySession } from "../src/client/session.js";
import type { CreateIntent, PreparedAppend, ThreadRef } from "../src/shared/types.js";

process.env.OURSAY_DEV_PASSKEY = "1";

const tmp = () => mkdtempSync(join(tmpdir(), "oursay-sess-"));

describe("02 session: derivation agrees with public-record; device-signed envelopes verify", () => {
  const jurisdiction = "ab-ca-gov";
  const thread: ThreadRef = { threadId: "root-1", jurisdiction };

  async function session() {
    const c = new DevPasskeyConnector({ rootDir: tmp(), seed: "sess" });
    await c.enrollDevice({ userId: "u1", deviceId: "d1" });
    const unlocked = await c.unlock({ userId: "u1", deviceId: "d1" });
    return { unlocked, sess: new IdentitySession(unlocked) };
  }

  it("personaPubkey and signerPubkey match the public-record primitives", async () => {
    const { unlocked, sess } = await session();
    const persona = deriveThreadKey({ jurisdictionMaster: unlocked.jurisdictionMaster(jurisdiction), threadId: thread.threadId, jurisdiction }).threadPubkey;
    const signer = deriveDeviceThreadSigner({ deviceRoot: unlocked.deviceRoot, threadId: thread.threadId, jurisdiction }).signerPubkey;
    expect(sess.personaPubkey(thread)).to.equal(persona);
    expect(sess.signerPubkey(thread)).to.equal(signer);
    expect(sess.personaPubkey(thread)).to.not.equal(sess.signerPubkey(thread));
  });

  it("nullifier matches threadNullifier over the per-jurisdiction nullifier root", async () => {
    const { unlocked, sess } = await session();
    const expected = threadNullifier(deriveNullifierSecret(unlocked.nullifierRoot(jurisdiction), jurisdiction), "poll-9");
    expect(sess.nullifier(thread, "poll-9")).to.equal(expected);
  });

  it("buildSigned: author = persona, signer = thread-scoped key, and it verifies", async () => {
    const { sess } = await session();
    const entityId = randomUUID();
    const intent: CreateIntent = { op: "create", type: "post", entityId, content: { body: "v1" } };
    const prep: PreparedAppend = { prevHash: null, rootEntityId: entityId };
    const { envelope } = sess.buildSigned(thread, prep, intent);
    expect(envelope.authorPubkey).to.equal(sess.personaPubkey(thread));
    expect(envelope.signerPubkey).to.equal(sess.signerPubkey(thread));
    expect(envelope.authorPubkey).to.not.equal(envelope.signerPubkey);
    expect(verifyEnvelope(envelope)).to.equal(true);
    expect(envelope.nullifier).to.equal(undefined); // non-singleton
  });

  it("buildSigned: a singleton create carries the per-jurisdiction nullifier", async () => {
    const { sess } = await session();
    const entityId = randomUUID();
    const parentId = randomUUID();
    const intent: CreateIntent = { op: "create", type: "vote", entityId, parent: { type: "poll", id: parentId }, content: { option: "yes" } };
    const prep: PreparedAppend = { prevHash: null, rootEntityId: parentId, nullifierParentId: parentId };
    const { envelope } = sess.buildSigned(thread, prep, intent);
    expect(envelope.nullifier).to.equal(sess.nullifier(thread, parentId));
    expect(verifyEnvelope(envelope)).to.equal(true);
  });
});
