// IdentitySession (no DB): the per-(device, thread) WebAuthn path under the mvp-a5b persona/signer
// split. buildSigned produces a webauthn-es256 envelope whose `signerPubkey` is THIS device's
// thread passkey pubkey and whose `authorPubkey` is the stable thread persona Pₜ (here equal to
// the signer because no server is involved — we simulate the first-join Pₜ assignment via
// `rememberPersona`). Nullifier derivation still agrees with public-record over the
// per-jurisdiction nullifier root.
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
    const sess = new IdentitySession(unlocked);
    // simulate first-device join: the local signer becomes Pₜ
    const signer = await sess.signingPubkey(thread);
    sess.rememberPersona(thread, signer);
    return { unlocked, sess };
  }

  it("signingPubkey is the per-(device, thread) passkey pubkey, created once and stable", async () => {
    const c = new DevPasskeyConnector({ rootDir: tmp(), seed: "sess2" });
    await c.enrollDevice({ userId: "u1", deviceId: "d1" });
    const unlocked = await c.unlock({ userId: "u1", deviceId: "d1" });
    const sess = new IdentitySession(unlocked);
    expect(unlocked.threadSigningPubkey(thread.threadId)).to.equal(null); // not created yet
    const signer = await sess.signingPubkey(thread);
    expect(signer).to.match(/^0[23][0-9a-f]{64}$/); // compressed SEC1 P-256
    expect(await sess.signingPubkey(thread)).to.equal(signer); // idempotent
    expect(unlocked.threadSigningPubkey(thread.threadId)).to.equal(signer);
    expect(unlocked.threadPersonaPubkey(thread.threadId)).to.equal(null); // Pₜ not yet remembered
    sess.rememberPersona(thread, signer); // simulate first-device join: Pₜ = this device's signer
    expect(sess.personaPubkey(thread)).to.equal(signer);
  });

  it("nullifier matches threadNullifier over the per-jurisdiction nullifier root", async () => {
    const { unlocked, sess } = await session();
    const expected = threadNullifier(deriveNullifierSecret(unlocked.nullifierRoot(jurisdiction), jurisdiction), "poll-9");
    expect(sess.nullifier(thread, "poll-9")).to.equal(expected);
  });

  it("buildSigned: authorPubkey = Pₜ, signerPubkey = device passkey, signScheme = webauthn-es256, verifies", async () => {
    const { sess } = await session();
    const entityId = randomUUID();
    const intent: CreateIntent = { op: "create", type: "post", entityId, content: { body: "v1" } };
    const prep: PreparedAppend = { prevHash: null, rootEntityId: entityId };
    const { envelope } = await sess.buildSigned(thread, prep, intent);
    expect(envelope.authorPubkey).to.equal(sess.personaPubkey(thread));
    expect(envelope.signerPubkey).to.equal(await sess.signingPubkey(thread));
    expect(envelope.signScheme).to.equal("webauthn-es256");
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

  it("buildSigned throws if rememberPersona has not been called for this thread", async () => {
    const c = new DevPasskeyConnector({ rootDir: tmp(), seed: "sess3" });
    await c.enrollDevice({ userId: "u1", deviceId: "d1" });
    const unlocked = await c.unlock({ userId: "u1", deviceId: "d1" });
    const sess = new IdentitySession(unlocked);
    await sess.signingPubkey(thread); // creates local credential, but no Pₜ yet
    const entityId = randomUUID();
    const intent: CreateIntent = { op: "create", type: "post", entityId, content: { body: "v1" } };
    const prep: PreparedAppend = { prevHash: null, rootEntityId: entityId };
    let err: unknown;
    try { await sess.buildSigned(thread, prep, intent); } catch (e) { err = e; }
    expect((err as Error)?.message ?? "").to.match(/persona|join/i);
  });
});
