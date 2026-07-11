// embedMentionTokens — replace ordered compose @spans with opaque tokens before hash/sign.
import { expect } from "chai";
import { buildMentionToken, parseMentionTokens } from "@oursay/encode";
import { composeSpanForCandidate, embedMentionTokens } from "../src/client/embed-mentions.js";
import type { MentionCandidate } from "../src/shared/types.js";

describe("embed-mentions", () => {
  const nodeA = "11111111-1111-4111-8111-111111111111";
  const nodeB = "22222222-2222-4222-8222-222222222222";
  const tokenA = buildMentionToken(nodeA);
  const tokenB = buildMentionToken(nodeB);

  it("composeSpanForCandidate derives @persona / @handle", () => {
    expect(composeSpanForCandidate({ kind: "persona", personaName: "CuriousFox12" })).to.equal(
      "@CuriousFox12",
    );
    expect(composeSpanForCandidate({ kind: "profile", handle: "alice" })).to.equal("@alice");
  });

  it("embeds tokens left-to-right across title and body", () => {
    const content = {
      title: "Hey @alice",
      body: "cc @CuriousFox12 and @Someone please",
    };
    const out = embedMentionTokens(
      content,
      [{ nodeId: nodeA }, { nodeId: nodeB, userId: "u2" }, { nodeId: nodeA }],
      ["@alice", "@CuriousFox12", "@Someone"],
    ) as { title: string; body: string };

    expect(out.title).to.equal(`Hey ${tokenA}`);
    expect(out.body).to.equal(`cc ${tokenB} and ${tokenA} please`);
    expect(parseMentionTokens(out.title).map((p) => p.nodeId)).to.deep.equal([nodeA]);
    expect(parseMentionTokens(out.body).map((p) => p.nodeId)).to.deep.equal([nodeB, nodeA]);
  });

  it("leaves content unchanged when no nodes", () => {
    const content = { body: "plain @alice text" };
    expect(embedMentionTokens(content, [], [])).to.deep.equal(content);
  });

  it("throws when a compose span is missing from content", () => {
    expect(() =>
      embedMentionTokens({ body: "no mention here" }, [{ nodeId: nodeA }], ["@alice"]),
    ).to.throw(/could not find compose span/);
  });

  it("throws on length mismatch", () => {
    expect(() =>
      embedMentionTokens({ body: "@a" }, [{ nodeId: nodeA }], ["@a", "@b"]),
    ).to.throw(/length mismatch/);
  });

  it("accepts MentionCandidate-derived spans for a related profile", () => {
    const mentions: MentionCandidate[] = [{ kind: "profile", handle: "bob" }];
    const spans = mentions.map(composeSpanForCandidate);
    const out = embedMentionTokens(
      { body: "hi @bob" },
      [{ nodeId: nodeA, userId: "u1" }],
      spans,
    ) as { body: string };
    expect(out.body).to.equal(`hi ${tokenA}`);
  });
});
