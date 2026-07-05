// Q4 — opaque per-thread commitment: determinism, sensitivity, opaqueness, frozen vector.
import { expect } from "chai";
import { threadCommitment } from "../src/commitment.js";
import { USER_ID, THREAD_ID, LEVEL, SALT_T_HEX, EXPECT } from "../src/vectors.js";

const base = { userId: USER_ID, saltT: SALT_T_HEX, threadId: THREAD_ID, level: LEVEL };

describe("03 commitment: H(user_id, salt_t, thread_id, level)", () => {
  it("is deterministic and matches the frozen vector", () => {
    expect(threadCommitment(base)).to.equal(threadCommitment(base));
    expect(threadCommitment(base)).to.equal(EXPECT.commitment);
  });

  it("changes when any input changes (incl. salt_t)", () => {
    const c = threadCommitment(base);
    expect(threadCommitment({ ...base, saltT: "00".repeat(32) })).to.not.equal(c);
    expect(threadCommitment({ ...base, userId: "user-bob" })).to.not.equal(c);
    expect(threadCommitment({ ...base, threadId: "thread-other" })).to.not.equal(c);
    expect(threadCommitment({ ...base, level: "municipal" })).to.not.equal(c);
  });

  it("is opaque: a 32-byte hex digest that does not leak its preimage", () => {
    const c = threadCommitment(base);
    expect(c).to.match(/^[0-9a-f]{64}$/);
    expect(c).to.not.contain(USER_ID);
    expect(c).to.not.contain(SALT_T_HEX);
    expect(c).to.not.contain(THREAD_ID);
  });
});
