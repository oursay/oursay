// Q4 — client-side binding inputs: §6 field shape, commitment binds the opening, envelope carries
// thread_pubkey ONLY (never the commitment / opening).
import { expect } from "chai";
import { buildThreadBindingInputs } from "../src/binding.js";
import { threadCommitment } from "../src/commitment.js";
import { deriveThreadKey } from "../src/derive.js";
import { signEnvelope } from "../src/envelope.js";
import { levelMaster, USER_ID, THREAD_ID, LEVEL, SALT_T_HEX, EXPECT } from "../src/vectors.js";

const key = () => deriveThreadKey({ levelMaster: levelMaster(), threadId: THREAD_ID, level: LEVEL });

function build(saltT?: string) {
  return buildThreadBindingInputs({
    userId: USER_ID,
    threadPubkey: key().threadPubkey,
    threadId: THREAD_ID,
    level: LEVEL,
    kycTier: "residency_verified",
    region: "ca-ab",
    saltT,
  });
}

describe("04 binding inputs: public binding + private opening", () => {
  it("public binding carries exactly the §6 fields (with the opaque commitment)", () => {
    const { binding } = build(SALT_T_HEX);
    expect(Object.keys(binding).sort()).to.deep.equal(
      ["commitment", "kyc_tier", "level", "region", "thread_id", "thread_pubkey"],
    );
    expect(binding.thread_pubkey).to.equal(EXPECT.threadPubkey);
    expect(binding.commitment).to.equal(EXPECT.commitment);
  });

  it("the commitment binds the private opening", () => {
    const { binding, opening } = build(SALT_T_HEX);
    expect(opening).to.deep.equal({ user_id: USER_ID, salt_t: SALT_T_HEX });
    expect(binding.commitment).to.equal(
      threadCommitment({ userId: opening.user_id, saltT: opening.salt_t, threadId: THREAD_ID, level: LEVEL }),
    );
  });

  it("generates a fresh 32-byte hex salt_t when none is supplied", () => {
    const a = build();
    const b = build();
    expect(a.opening.salt_t).to.match(/^[0-9a-f]{64}$/);
    expect(a.opening.salt_t).to.not.equal(b.opening.salt_t);
    expect(a.binding.commitment).to.not.equal(b.binding.commitment);
  });

  it("the public envelope carries thread_pubkey only — never the commitment or opening", () => {
    const { binding, opening } = build(SALT_T_HEX);
    const { envelope } = signEnvelope(
      {
        v: 1, txId: "22222222-2222-4222-8222-222222222222", type: "post", entityId: "e1", op: "create",
        authorPubkey: "", signature: "", createdAt: "2026-01-01T00:00:00.000Z", prevHash: null,
        contentHash: EXPECT.contentHash,
      },
      key().privKey,
    );
    const serialized = JSON.stringify(envelope);
    expect(envelope.authorPubkey).to.equal(binding.thread_pubkey);
    expect(serialized).to.not.contain(binding.commitment);
    expect(serialized).to.not.contain(opening.salt_t);
    expect(serialized).to.not.contain(opening.user_id);
    expect(Object.keys(envelope)).to.not.include("commitment");
  });
});
