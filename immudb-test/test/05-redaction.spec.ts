import { expect } from "chai";
import { getWorld } from "./helpers/world.js";
import { buildBundle } from "../src/export.js";
import { verifyBundle } from "../src/verifier.js";
import { contentCommitment, sha256Hex } from "../src/commitment.js";

/**
 * REDACTION for Canada's Online Harms Act: stop DISTRIBUTING a specific message, but
 * (a) keep the dataset verifiable, and (b) retain the raw content privately for law
 * enforcement. We never mutate the immutable ledger — we withhold plaintext from the
 * public bundle. The commitment (hash) stays, so all proofs still verify.
 */
describe("05 redaction: withhold plaintext, keep integrity (Online Harms Act)", () => {
  it("redacted entry keeps a valid proof but exposes only its hash", async () => {
    const { immu, ledger, priv } = await getWorld();

    const keep = await ledger.append({ type: "post", authorRef: "alice", content: { text: "ordinary civic post" } });
    const harmful = await ledger.append({ type: "comment", authorRef: "bob", content: { text: "harmful content to redact" } });

    // Redact: withhold from public distribution, retain privately.
    await priv.redact(harmful.id);

    const bundle = await buildBundle(immu, priv, [keep.key, harmful.key]);
    const report = verifyBundle(bundle, bundle.anchor.bundleMerkleRoot);

    // Whole dataset still verifies.
    expect(report.ok, "dataset still verifies after redaction").to.equal(true);

    const redacted = bundle.entries.find((e) => e.envelope.id === harmful.id)!;
    const kept = bundle.entries.find((e) => e.envelope.id === keep.id)!;

    expect(redacted.reveal, "no plaintext for redacted entry").to.equal(undefined);
    expect(redacted.envelope.contentHash).to.match(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(redacted)).to.not.include("harmful content");
    expect(kept.reveal, "ordinary entry still revealed").to.exist;
    expect(report.verdicts.find((v) => v.id === harmful.id)!.status).to.equal("redacted");
  });

  it("law enforcement can still recompute the commitment from retained private data", async () => {
    const { ledger, priv } = await getWorld();
    const r = await ledger.append({ type: "post", authorRef: "alice", content: { text: "evidence" } });
    await priv.redact(r.id);

    const c = await priv.getContent(r.id);
    expect(c, "raw content retained after redaction").to.exist;
    expect(c!.content).to.deep.equal({ text: "evidence" });
    const env = await ledger.get(r.key);
    expect(contentCommitment({ id: r.id, salt: c!.salt, content: c!.content })).to.equal(env.contentHash);
  });

  it("salt hides low-entropy votes: brute-forcing the option space does not match", async () => {
    const { ledger, priv } = await getWorld();
    const vote = await ledger.append({ type: "vote", parentId: "poll-x", authorRef: "carol", content: { option: "yes" } });
    await priv.redact(vote.id);
    const env = await ledger.get(vote.key);

    // Without the secret salt, an attacker cannot match the published hash by guessing.
    const guesses = ["yes", "no", "abstain"];
    const anyUnsaltedMatch = guesses.some((o) => sha256Hex(JSON.stringify({ option: o })) === env.contentHash);
    expect(anyUnsaltedMatch, "unsalted guesses must not match").to.equal(false);
  });
});
