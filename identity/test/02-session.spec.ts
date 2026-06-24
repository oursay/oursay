// IdentitySession (no DB): the per-thread WebAuthn path. buildSigned produces an author = thread
// passkey pubkey, signScheme = webauthn-es256 envelope (with a webauthn assertion) that verifies, and
// nullifier derivation still agrees with public-record over the per-jurisdiction nullifier root.
import { expect } from "chai";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { deriveNullifierSecret, threadNullifier, verifyEnvelope } from "@oursay/public-record";
import { DevPasskeyConnector } from "../src/client/dev-connector.js";
import { IdentitySession } from "../src/client/session.js";
import type { CreateIntent, PreparedAppend, ThreadRef } from "../src/shared/types.js";

process.env.OURSAY_DEV_PASSKEY = "1";

const tmp = () => mkdtempSync(join(tmpdir(), "oursay-sess-"));

describe("02 session: per-thread WebAuthn envelopes verify; nullifier agrees with public-record", () => {
  const jurisdiction = "ab-ca-gov";
  const thread: ThreadRef = { threadId: "root-1", jurisdiction };

  async function session() {
    const c = new DevPasskeyConnector({ rootDir: tmp(), seed: "sess" });
    await c.enrollDevice({ userId: "u1", deviceId: "d1" });
    const unlocked = await c.unlock({ userId: "u1", deviceId: "d1" });
    return { unlocked, sess: new IdentitySession(unlocked) };
  }

  it("authorPubkey is the thread passkey pubkey, created once and stable", async () => {
    const { unlocked, sess } = await session();
    expect(unlocked.threadCredentialPubkey(thread.threadId)).to.equal(null); // not created yet
    const author = await sess.authorPubkey(thread);
    expect(author).to.match(/^0[23][0-9a-f]{64}$/); // compressed SEC1 P-256
    expect(await sess.authorPubkey(thread)).to.equal(author); // idempotent
    expect(unlocked.threadCredentialPubkey(thread.threadId)).to.equal(author);
  });

  it("nullifier matches threadNullifier over the per-jurisdiction nullifier root", async () => {
    const { unlocked, sess } = await session();
    const expected = threadNullifier(deriveNullifierSecret(unlocked.nullifierRoot(jurisdiction), jurisdiction), "poll-9");
    expect(sess.nullifier(thread, "poll-9")).to.equal(expected);
  });

  it("buildSigned: author = thread passkey, signScheme = webauthn-es256, and it verifies", async () => {
    const { sess } = await session();
    const entityId = randomUUID();
    const intent: CreateIntent = { op: "create", type: "post", entityId, content: { body: "v1" } };
    const prep: PreparedAppend = { prevHash: null, rootEntityId: entityId };
    const { envelope } = await sess.buildSigned(thread, prep, intent);
    expect(envelope.authorPubkey).to.equal(await sess.authorPubkey(thread));
    expect(envelope.signScheme).to.equal("webauthn-es256");
    expect(envelope.signerPubkey).to.equal(undefined);
    expect(envelope.signature).to.equal("");
    expect(envelope.webauthn).to.be.an("object");
    expect(verifyEnvelope(envelope)).to.equal(true);
    expect(envelope.nullifier).to.equal(undefined); // non-singleton
  });

  it("buildSigned: a singleton create carries the per-jurisdiction nullifier and verifies", async () => {
    const { sess } = await session();
    const entityId = randomUUID();
    const parentId = randomUUID();
    const intent: CreateIntent = { op: "create", type: "vote", entityId, parent: { type: "poll", id: parentId }, content: { option: "yes" } };
    const prep: PreparedAppend = { prevHash: null, rootEntityId: parentId, nullifierParentId: parentId };
    const { envelope } = await sess.buildSigned(thread, prep, intent);
    expect(envelope.nullifier).to.equal(sess.nullifier(thread, parentId));
    expect(verifyEnvelope(envelope)).to.equal(true);
  });
});
