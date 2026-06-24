import { expect } from "chai";
import { randomUUID } from "node:crypto";
import { p256 } from "@noble/curves/p256";
import { bytesToHex } from "@noble/hashes/utils";
import { blockConfig } from "../src/config.js";
import { contentCommitment, newSalt } from "../src/crypto/commitment.js";
import { deriveThreadKey } from "../src/identity/derive.js";
import { deriveNullifierSecret, threadNullifier } from "../src/identity/nullifier.js";
import { signEnvelope } from "../src/identity/envelope.js";
import { buildThreadBindingInputs } from "../src/identity/binding.js";
import { signBinding } from "../src/identity/platform-binding.js";
import { PublicChain } from "../src/ledger/chain.js";
import { BlockSettler } from "../src/ledger/settler.js";
import type { PgWireLedgerConnector } from "../src/ledger/pgwire.connector.js";
import type { PrivateStore } from "../src/private/store.js";
import { RecordService } from "../src/record.js";
import { DELETE_MARKER, type RecordType, type TxEnvelope } from "../src/schema/types.js";
import { getWorld, rejects } from "./helpers/world.js";

/**
 * The signed write path across the full CREATE surface (phase 2a): root creates (post/poll/petition)
 * and attachments (comment/reaction/vote/petition_signature), via prepare → sign → commit, with the
 * platform-attested nullifier as the authoritative one-per-(user,parent) dedupe.
 */
describe("13 signed ops: all create types via prepare → sign → appendSigned", () => {
  const platformPriv = bytesToHex(p256.utils.randomPrivateKey());
  const jurisdiction = "ab-ca-gov";
  const kycTier = "residency_verified";

  let store: PrivateStore;
  let connector: PgWireLedgerConnector;
  let svc: RecordService;
  let settler: BlockSettler;

  before(async () => {
    const w = await getWorld();
    store = w.store;
    connector = w.connector;
    await store.reset();
    const chainId = randomUUID();
    // enforceSigningPolicy:false — this spec exercises the raw p256 path on forced types (vote/
    // petition_signature); the webauthn-es256 hard requirement is covered in webauthn-envelope.spec.
    svc = new RecordService(new PublicChain(store, chainId), store, { platformBindingPrivKeyHex: platformPriv, signedEnvelopeMaxAgeSec: 0, enforceSigningPolicy: false });
    settler = new BlockSettler(store, connector, chainId, blockConfig);
  });

  interface U { userId: string; lm: Uint8Array; nsecret: Uint8Array }

  async function newUser(): Promise<U> {
    const userId = randomUUID();
    await store.putUser({ id: userId });
    const lm = p256.utils.randomPrivateKey(); // a valid 32-byte jurisdiction master (also a P-256 seed)
    await store.putJurisdictionMaster({ userId, jurisdiction, masterPubkey: bytesToHex(p256.getPublicKey(lm)) });
    return { userId, lm, nsecret: deriveNullifierSecret(lm, jurisdiction) };
  }

  /** Register this user's thread for a ROOT entity (thread = root). */
  async function registerThread(u: U, rootId: string): Promise<{ privKey: Uint8Array; threadPubkey: string }> {
    const { privKey, threadPubkey } = deriveThreadKey({ jurisdictionMaster: u.lm, threadId: rootId, jurisdiction });
    const { binding } = buildThreadBindingInputs({ userId: u.userId, threadPubkey, threadId: rootId, jurisdiction, kycTier, saltT: newSalt() });
    await store.registerThreadBinding({
      threadPubkey, userId: u.userId, threadId: rootId, jurisdiction, kycTier,
      commitment: binding.commitment, bindingSig: signBinding(binding, platformPriv),
    });
    return { privKey, threadPubkey };
  }

  /** prepare → derive nullifier (singletons) → build+sign → appendSigned. */
  async function act(
    u: U,
    threadPriv: Uint8Array,
    threadPubkey: string,
    spec: { type: RecordType; entityId: string; parent?: { type: RecordType; id: string }; content: unknown },
  ) {
    const prep = await svc.prepareAppend({
      op: "create", type: spec.type, author: threadPubkey, parent: spec.parent, entityId: spec.entityId, content: spec.content,
    });
    const txId = randomUUID();
    const salt = newSalt();
    const base: TxEnvelope = {
      v: 1, txId, type: spec.type, entityId: spec.entityId, op: "create",
      ...(spec.parent ? { parentType: spec.parent.type, parentId: spec.parent.id } : {}),
      ...(prep.parentRevisionHash ? { parentRevisionHash: prep.parentRevisionHash } : {}),
      ...(prep.parentRevisionTxId ? { parentRevisionTxId: prep.parentRevisionTxId } : {}),
      authorPubkey: "", signature: "", createdAt: new Date().toISOString(), prevHash: null,
      contentHash: contentCommitment({ id: txId, salt, content: spec.content }),
      ...(prep.nullifierParentId ? { nullifier: threadNullifier(u.nsecret, prep.nullifierParentId) } : {}),
    };
    const { envelope } = signEnvelope(base, threadPriv);
    return svc.appendSigned({ envelope, salt, content: spec.content });
  }

  /** prepare(update|delete) → carry head fields (prevHash, parent*, nullifier) → sign → appendSigned.
   *  `overrides` lets a test deliberately tamper (e.g. a stale prevHash) for negative cases. */
  async function actMutation(
    threadPriv: Uint8Array,
    threadPubkey: string,
    spec: { op: "update" | "delete"; type: RecordType; entityId: string; content: unknown },
    overrides: Partial<TxEnvelope> = {},
  ) {
    const prep = await svc.prepareAppend({ op: spec.op, author: threadPubkey, entityId: spec.entityId });
    const txId = randomUUID();
    const salt = newSalt();
    const base: TxEnvelope = {
      v: 1, txId, type: spec.type, entityId: spec.entityId, op: spec.op,
      ...(prep.parentType ? { parentType: prep.parentType } : {}),
      ...(prep.parentId ? { parentId: prep.parentId } : {}),
      ...(prep.parentRevisionHash ? { parentRevisionHash: prep.parentRevisionHash } : {}),
      ...(prep.parentRevisionTxId ? { parentRevisionTxId: prep.parentRevisionTxId } : {}),
      authorPubkey: "", signature: "", createdAt: new Date().toISOString(), prevHash: prep.prevHash,
      contentHash: contentCommitment({ id: txId, salt, content: spec.content }),
      ...(prep.nullifier ? { nullifier: prep.nullifier } : {}),
      ...overrides,
    };
    const { envelope } = signEnvelope(base, threadPriv);
    return svc.appendSigned({ envelope, salt, content: spec.content });
  }

  it("appends every create type through the verified path; tallies count one verified participant", async () => {
    const author = await newUser();
    const postId = randomUUID();
    const aPost = await registerThread(author, postId);
    await act(author, aPost.privKey, aPost.threadPubkey, { type: "post", entityId: postId, content: { body: "belief" } });

    const pollId = randomUUID();
    const aPoll = await registerThread(author, pollId);
    await act(author, aPoll.privKey, aPoll.threadPubkey, { type: "poll", entityId: pollId, content: { question: "Fix the road?", options: ["yes", "no"] } });

    const petId = randomUUID();
    const aPet = await registerThread(author, petId);
    await act(author, aPet.privKey, aPet.threadPubkey, { type: "petition", entityId: petId, content: { title: "T", text: "..." } });

    const bob = await newUser();
    const bPost = await registerThread(bob, postId);
    await act(bob, bPost.privKey, bPost.threadPubkey, { type: "comment", entityId: randomUUID(), parent: { type: "post", id: postId }, content: { body: "agree" } });
    await act(bob, bPost.privKey, bPost.threadPubkey, { type: "reaction", entityId: randomUUID(), parent: { type: "post", id: postId }, content: { kind: "check" } });
    const bPoll = await registerThread(bob, pollId);
    await act(bob, bPoll.privKey, bPoll.threadPubkey, { type: "vote", entityId: randomUUID(), parent: { type: "poll", id: pollId }, content: { option: "yes" } });
    const bPet = await registerThread(bob, petId);
    await act(bob, bPet.privKey, bPet.threadPubkey, { type: "petition_signature", entityId: randomUUID(), parent: { type: "petition", id: petId }, content: {} });

    await settler.flushPendingSettlement();

    expect((await store.getPollResults(pollId)).find((r) => r.option === "yes")!.count).to.equal(1);
    expect(await store.getPetitionSignatureCount(petId)).to.equal(1);
    expect((await store.getReactionCountsByEntity(postId)).find((r) => r.kind === "check")!.count).to.equal(1);
  });

  it("reaction is one-per-(user,parent): two different comments OK, a repeat on the SAME comment rejected", async () => {
    const author = await newUser();
    const postId = randomUUID();
    const ak = await registerThread(author, postId);
    await act(author, ak.privKey, ak.threadPubkey, { type: "post", entityId: postId, content: { body: "p" } });
    const c1 = randomUUID();
    const c2 = randomUUID();
    await act(author, ak.privKey, ak.threadPubkey, { type: "comment", entityId: c1, parent: { type: "post", id: postId }, content: { body: "c1" } });
    await act(author, ak.privKey, ak.threadPubkey, { type: "comment", entityId: c2, parent: { type: "post", id: postId }, content: { body: "c2" } });

    const bob = await newUser();
    const bk = await registerThread(bob, postId);
    await act(bob, bk.privKey, bk.threadPubkey, { type: "reaction", entityId: randomUUID(), parent: { type: "comment", id: c1 }, content: { kind: "check" } });
    await act(bob, bk.privKey, bk.threadPubkey, { type: "reaction", entityId: randomUUID(), parent: { type: "comment", id: c2 }, content: { kind: "check" } });
    // second reaction on the SAME comment c1 ⇒ duplicate nullifier ⇒ rejected
    expect(await rejects(act(bob, bk.privKey, bk.threadPubkey, { type: "reaction", entityId: randomUUID(), parent: { type: "comment", id: c1 }, content: { kind: "cross" } }))).to.equal(true);

    await settler.flushPendingSettlement();
    expect((await store.getReactionCountsByEntity(c1)).find((r) => r.kind === "check")!.count).to.equal(1);
    expect((await store.getReactionCountsByEntity(c2)).find((r) => r.kind === "check")!.count).to.equal(1);
  });

  it("a second vote by the same user, and a replay of another user's nullifier, are both rejected", async () => {
    const author = await newUser();
    const pollId = randomUUID();
    const ak = await registerThread(author, pollId);
    await act(author, ak.privKey, ak.threadPubkey, { type: "poll", entityId: pollId, content: { question: "Q?", options: ["yes", "no"] } });

    const alice = await newUser();
    const alicePoll = await registerThread(alice, pollId);
    await act(alice, alicePoll.privKey, alicePoll.threadPubkey, { type: "vote", entityId: randomUUID(), parent: { type: "poll", id: pollId }, content: { option: "yes" } });
    // Alice votes again on the same poll ⇒ duplicate (her own nullifier already active) ⇒ rejected.
    expect(await rejects(act(alice, alicePoll.privKey, alicePoll.threadPubkey, { type: "vote", entityId: randomUUID(), parent: { type: "poll", id: pollId }, content: { option: "no" } }))).to.equal(true);

    // Bob tries to REPLAY Alice's nullifier value on the same poll ⇒ UNIQUE(parent,nullifier) collision ⇒ rejected.
    const aliceNullifier = threadNullifier(alice.nsecret, pollId);
    const bob = await newUser();
    const bobPoll = await registerThread(bob, pollId);
    const txId = randomUUID();
    const salt = newSalt();
    const content = { option: "no" };
    const base: TxEnvelope = {
      v: 1, txId, type: "vote", entityId: randomUUID(), op: "create",
      parentType: "poll", parentId: pollId, authorPubkey: "", signature: "",
      createdAt: new Date().toISOString(), prevHash: null,
      contentHash: contentCommitment({ id: txId, salt, content }), nullifier: aliceNullifier,
    };
    const { envelope } = signEnvelope(base, bobPoll.privKey);
    expect(await rejects(svc.appendSigned({ envelope, salt, content }))).to.equal(true);

    await settler.flushPendingSettlement();
    expect((await store.getPollResults(pollId)).find((r) => r.option === "yes")!.count).to.equal(1);
    expect((await store.getPollResults(pollId)).find((r) => r.option === "no")).to.be.undefined;
  });

  it("rejects a non-singleton create that carries a nullifier, and a stale parent revision", async () => {
    const author = await newUser();
    const postId = randomUUID();
    const ak = await registerThread(author, postId);
    await act(author, ak.privKey, ak.threadPubkey, { type: "post", entityId: postId, content: { body: "p" } });

    const bob = await newUser();
    const bk = await registerThread(bob, postId);

    // a comment (non-singleton) MUST NOT carry a nullifier
    const prep = await svc.prepareAppend({ op: "create", type: "comment", author: bk.threadPubkey, parent: { type: "post", id: postId }, entityId: randomUUID(), content: { body: "c" } });
    const txId = randomUUID();
    const salt = newSalt();
    const content = { body: "c" };
    const withNullifier: TxEnvelope = {
      v: 1, txId, type: "comment", entityId: randomUUID(), op: "create",
      parentType: "post", parentId: postId,
      ...(prep.parentRevisionHash ? { parentRevisionHash: prep.parentRevisionHash } : {}),
      authorPubkey: "", signature: "", createdAt: new Date().toISOString(), prevHash: null,
      contentHash: contentCommitment({ id: txId, salt, content }), nullifier: "deadbeef".repeat(8),
    };
    expect(await rejects(svc.appendSigned({ envelope: signEnvelope(withNullifier, bk.privKey).envelope, salt, content }))).to.equal(true);

    // stale parent revision ⇒ rejected
    const stale: TxEnvelope = {
      v: 1, txId: randomUUID(), type: "comment", entityId: randomUUID(), op: "create",
      parentType: "post", parentId: postId, parentRevisionHash: "00".repeat(32),
      authorPubkey: "", signature: "", createdAt: new Date().toISOString(), prevHash: null,
      contentHash: contentCommitment({ id: txId, salt, content }),
    };
    expect(await rejects(svc.appendSigned({ envelope: signEnvelope(stale, bk.privKey).envelope, salt, content }))).to.equal(true);
  });

  // ── 2b: signed update / delete ──────────────────────────────────────────────────────────

  it("signed edit of a root post: folded content updates, chain verifies", async () => {
    const author = await newUser();
    const postId = randomUUID();
    const ak = await registerThread(author, postId);
    await act(author, ak.privKey, ak.threadPubkey, { type: "post", entityId: postId, content: { body: "v1" } });
    const ref = await actMutation(ak.privKey, ak.threadPubkey, { op: "update", type: "post", entityId: postId, content: { body: "v2" } });
    await settler.flushPendingSettlement();

    expect((await store.getEntityState(postId))!.content).to.deep.equal({ body: "v2" });
    expect((await connector.verifyRow(ref.txId)).verified).to.equal(true);
  });

  it("signed vote change: allowed when poll rules permit + before deadline; rejected when final", async () => {
    const author = await newUser();
    // changeable poll
    const openPoll = randomUUID();
    const ap1 = await registerThread(author, openPoll);
    await act(author, ap1.privKey, ap1.threadPubkey, { type: "poll", entityId: openPoll, content: { question: "Q1", options: ["yes", "no"], rules: { allowChange: true } } });
    // final poll (no allowChange)
    const finalPoll = randomUUID();
    const ap2 = await registerThread(author, finalPoll);
    await act(author, ap2.privKey, ap2.threadPubkey, { type: "poll", entityId: finalPoll, content: { question: "Q2", options: ["yes", "no"] } });

    const bob = await newUser();
    const bOpen = await registerThread(bob, openPoll);
    const voteId = randomUUID();
    await act(bob, bOpen.privKey, bOpen.threadPubkey, { type: "vote", entityId: voteId, parent: { type: "poll", id: openPoll }, content: { option: "yes" } });
    // change the vote (allowed) — same nullifier carried forward, tally moves to "no"
    await actMutation(bOpen.privKey, bOpen.threadPubkey, { op: "update", type: "vote", entityId: voteId, content: { option: "no" } });

    const bFinal = await registerThread(bob, finalPoll);
    const finalVoteId = randomUUID();
    await act(bob, bFinal.privKey, bFinal.threadPubkey, { type: "vote", entityId: finalVoteId, parent: { type: "poll", id: finalPoll }, content: { option: "yes" } });
    // change on a final poll ⇒ rejected by governance
    expect(await rejects(actMutation(bFinal.privKey, bFinal.threadPubkey, { op: "update", type: "vote", entityId: finalVoteId, content: { option: "no" } }))).to.equal(true);

    await settler.flushPendingSettlement();
    expect((await store.getPollResults(openPoll)).find((r) => r.option === "no")!.count).to.equal(1);
    expect((await store.getPollResults(openPoll)).find((r) => r.option === "yes")).to.be.undefined;
    expect((await store.getPollResults(finalPoll)).find((r) => r.option === "yes")!.count).to.equal(1);
  });

  it("signed petition_signature revoke: allowed when rules permit; rejected otherwise", async () => {
    const author = await newUser();
    const okPet = randomUUID();
    const a1 = await registerThread(author, okPet);
    await act(author, a1.privKey, a1.threadPubkey, { type: "petition", entityId: okPet, content: { title: "P1", text: "...", rules: { allowRevoke: true } } });
    const noPet = randomUUID();
    const a2 = await registerThread(author, noPet);
    await act(author, a2.privKey, a2.threadPubkey, { type: "petition", entityId: noPet, content: { title: "P2", text: "..." } });

    const bob = await newUser();
    const bOk = await registerThread(bob, okPet);
    const sigOk = randomUUID();
    await act(bob, bOk.privKey, bOk.threadPubkey, { type: "petition_signature", entityId: sigOk, parent: { type: "petition", id: okPet }, content: {} });
    await actMutation(bOk.privKey, bOk.threadPubkey, { op: "delete", type: "petition_signature", entityId: sigOk, content: DELETE_MARKER });

    const bNo = await registerThread(bob, noPet);
    const sigNo = randomUUID();
    await act(bob, bNo.privKey, bNo.threadPubkey, { type: "petition_signature", entityId: sigNo, parent: { type: "petition", id: noPet }, content: {} });
    expect(await rejects(actMutation(bNo.privKey, bNo.threadPubkey, { op: "delete", type: "petition_signature", entityId: sigNo, content: DELETE_MARKER }))).to.equal(true);

    await settler.flushPendingSettlement();
    expect(await store.getPetitionSignatureCount(okPet)).to.equal(0); // revoked
    expect(await store.getPetitionSignatureCount(noPet)).to.equal(1); // revoke rejected
  });

  it("signed reaction kind change keeps one count and the same nullifier", async () => {
    const author = await newUser();
    const postId = randomUUID();
    const ak = await registerThread(author, postId);
    await act(author, ak.privKey, ak.threadPubkey, { type: "post", entityId: postId, content: { body: "p" } });

    const bob = await newUser();
    const bk = await registerThread(bob, postId);
    const reactionId = randomUUID();
    await act(bob, bk.privKey, bk.threadPubkey, { type: "reaction", entityId: reactionId, parent: { type: "post", id: postId }, content: { kind: "check" } });
    await actMutation(bk.privKey, bk.threadPubkey, { op: "update", type: "reaction", entityId: reactionId, content: { kind: "cross" } });

    await settler.flushPendingSettlement();
    const counts = await store.getReactionCountsByEntity(postId);
    expect(counts.find((c) => c.kind === "cross")!.count).to.equal(1);
    expect(counts.find((c) => c.kind === "check")).to.be.undefined;
  });

  it("rejects a stale prevHash and a cross-author edit", async () => {
    const author = await newUser();
    const postId = randomUUID();
    const ak = await registerThread(author, postId);
    const created = await act(author, ak.privKey, ak.threadPubkey, { type: "post", entityId: postId, content: { body: "v1" } });

    // first edit moves the head
    await actMutation(ak.privKey, ak.threadPubkey, { op: "update", type: "post", entityId: postId, content: { body: "v2" } });
    // a second edit signed against the ORIGINAL head txHash ⇒ stale ⇒ rejected
    expect(await rejects(actMutation(ak.privKey, ak.threadPubkey, { op: "update", type: "post", entityId: postId, content: { body: "v3" } }, { prevHash: created.txHash }))).to.equal(true);

    // a DIFFERENT user's thread key cannot edit the post (author-match fails)
    const mallory = await newUser();
    const mk = await registerThread(mallory, postId);
    expect(await rejects(actMutation(mk.privKey, mk.threadPubkey, { op: "update", type: "post", entityId: postId, content: { body: "hijack" } }))).to.equal(true);
  });

  it("freshness gate: accepts a fresh createdAt, rejects an expired one and excessive future skew", async () => {
    const NOW = Date.parse("2026-06-19T12:00:00.000Z");
    // a dedicated service with the gate ON (120s max age, 60s future skew) + an injected clock.
    const gated = new RecordService(new PublicChain(store, randomUUID()), store, {
      platformBindingPrivKeyHex: platformPriv,
      signedEnvelopeMaxAgeSec: 120,
      signedEnvelopeFutureSkewSec: 60,
      now: () => NOW,
    });

    // Build + sign a `post` create with a chosen createdAt, registering (user, entityId) first.
    const signedPostAt = async (createdAt: string) => {
      const u = await newUser();
      const entityId = randomUUID();
      const { privKey } = await registerThread(u, entityId);
      const txId = randomUUID();
      const salt = newSalt();
      const content = { body: "x" };
      const base: TxEnvelope = {
        v: 1, txId, type: "post", entityId, op: "create",
        authorPubkey: "", signature: "", createdAt, prevHash: null,
        contentHash: contentCommitment({ id: txId, salt, content }),
      };
      return { envelope: signEnvelope(base, privKey).envelope, salt, content };
    };
    const msg = async (p: Promise<unknown>): Promise<string> => {
      try { await p; return ""; } catch (e) { return (e as Error).message; }
    };

    // fresh (now) ⇒ accepted
    await gated.appendSigned(await signedPostAt(new Date(NOW).toISOString()));
    // 3 minutes old (> 120s) ⇒ expired
    expect(await msg(gated.appendSigned(await signedPostAt(new Date(NOW - 180_000).toISOString())))).to.include("expired");
    // 5 minutes in the future (> 60s skew) ⇒ clock-skew rejection (distinct message)
    expect(await msg(gated.appendSigned(await signedPostAt(new Date(NOW + 300_000).toISOString())))).to.include("future");
    // within the future skew (30s) ⇒ accepted
    await gated.appendSigned(await signedPostAt(new Date(NOW + 30_000).toISOString()));
  });
});
