import { expect } from "chai";
import { randomUUID } from "node:crypto";
import {
  buildMentionToken,
  collectMentionNodeIds,
  parseMentionTokens,
} from "../src/mention-token.js";
import { encodeUuidV4Base59 } from "../src/uuid-base59.js";

describe("mention-token", () => {
  it("round-trips build → parse", () => {
    const nodeId = randomUUID();
    const token = buildMentionToken(nodeId);
    expect(token).to.match(/^<@[0-9A-Za-z_]+>$/);
    const parsed = parseMentionTokens(`Thanks ${token} for clarifying.`);
    expect(parsed).to.have.length(1);
    expect(parsed[0]!.nodeId).to.equal(nodeId);
    expect(parsed[0]!.token).to.equal(token);
  });

  it("ignores plain @handle text", () => {
    expect(parseMentionTokens("Thanks @alice for clarifying.")).to.deep.equal([]);
  });

  it("ignores malformed token payloads", () => {
    expect(parseMentionTokens("Hi <@not-valid-base59!> there")).to.deep.equal([]);
  });

  it("collects unique node ids across strings", () => {
    const a = randomUUID();
    const b = randomUUID();
    const ta = buildMentionToken(a);
    const tb = buildMentionToken(b);
    expect(collectMentionNodeIds(`${ta} and ${tb}`, `again ${ta}`)).to.deep.equal([a, b]);
  });

  it("short-circuits when no <@ present", () => {
    expect(parseMentionTokens("no tokens here")).to.deep.equal([]);
    expect(collectMentionNodeIds("plain")).to.deep.equal([]);
  });

  it("matches the encodeUuidV4Base59 payload shape", () => {
    const nodeId = "550e8400-e29b-41d4-a716-446655440000";
    expect(buildMentionToken(nodeId)).to.equal(`<@${encodeUuidV4Base59(nodeId)}>`);
  });
});
