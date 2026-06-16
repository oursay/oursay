import { expect } from "chai";
import { getWorld, seedUsers } from "./helpers/world.js";
import { contentCommitment } from "../src/commitment.js";

describe("01 ledger: public commitments + private content", () => {
  it("writes an envelope with a content hash but no plaintext to immudb", async () => {
    const { ledger, priv } = await getWorld();
    await seedUsers(priv);

    const content = { text: "The council should fund the library." };
    const res = await ledger.append({ type: "post", authorRef: "alice", content });

    // immudb holds the envelope (commitment), and the value never contains the plaintext.
    const env = await ledger.get(res.key);
    expect(env.type).to.equal("post");
    expect(env.id).to.equal(res.id);
    expect(env.contentHash).to.match(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(env)).to.not.include("library");

    // The commitment is reproducible from the privately-held (salt, content).
    const c = await priv.getContent(res.id);
    expect(c, "private content present").to.exist;
    expect(contentCommitment({ id: res.id, salt: c!.salt, content: c!.content })).to.equal(env.contentHash);
  });

  it("supports all five public types as key prefixes", async () => {
    const { ledger } = await getWorld();
    const post = await ledger.append({ type: "post", authorRef: "alice", content: { text: "p" } });
    const cases = [
      { type: "reaction" as const, content: { kind: "up" }, parentId: post.id },
      { type: "comment" as const, content: { text: "c" }, parentId: post.id },
      { type: "poll" as const, content: { question: "fund?", options: ["yes", "no"] } },
      { type: "vote" as const, content: { option: "yes" }, parentId: post.id },
    ];
    for (const k of cases) {
      const r = await ledger.append({ type: k.type, authorRef: "bob", content: k.content, parentId: k.parentId });
      expect(r.key.startsWith(k.type + ":")).to.equal(true);
      const env = await ledger.get(r.key);
      expect(env.type).to.equal(k.type);
    }
  });
});
