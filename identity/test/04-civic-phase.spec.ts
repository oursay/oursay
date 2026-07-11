// CivicHttpClient.append — onThreadPasskeyPhase fires at create vs assert boundaries.
import { expect } from "chai";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DevPasskeyConnector } from "../src/client/dev-connector.js";
import { CivicHttpClient } from "../src/client/civic-http-client.js";
import { IdentitySession } from "../src/client/session.js";
import type { CreateIntent, ThreadRef } from "../src/shared/types.js";

process.env.OURSAY_DEV_PASSKEY = "1";

const tmp = () => mkdtempSync(join(tmpdir(), "oursay-civic-phase-"));

describe("04 civic phase: append onThreadPasskeyPhase", () => {
  const jurisdiction = "ab-ca-gov";
  const thread: ThreadRef = { threadId: "root-phase", jurisdiction };
  const intent: CreateIntent = {
    op: "create",
    type: "post",
    entityId: thread.threadId,
    content: { title: "Phase test", body: "v1" },
  };

  async function clientWithMockFetch() {
    const c = new DevPasskeyConnector({ rootDir: tmp(), seed: "phase" });
    await c.enrollDevice({ userId: "u1", deviceId: "d1" });
    const sess = new IdentitySession(await c.unlock({ userId: "u1", deviceId: "d1" }));
    const fetchMock = async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes("/v1/civic/threads/join")) {
        const personaPubkey = await sess.signingPubkey(thread);
        sess.rememberPersona(thread, personaPubkey);
        return new Response(JSON.stringify({ personaPubkey, personaName: "PhaseAnon" }), { status: 200 });
      }
      if (url.includes("/v1/civic/appends/prepare")) {
        return new Response(JSON.stringify({ prevHash: null, rootEntityId: thread.threadId }), { status: 200 });
      }
      if (url.includes("/v1/civic/appends/submit")) {
        return new Response(
          JSON.stringify({ txId: "tx-1", entityId: thread.threadId, txHash: "abc" }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const client = new CivicHttpClient({
      baseUrl: "http://localhost",
      session: sess,
      fetch: fetchMock as typeof fetch,
    });
    return { client, sess };
  }

  it("first passkey append: creating then signing", async () => {
    const { client } = await clientWithMockFetch();
    const phases: string[] = [];
    await client.append(thread, intent, {
      onThreadPasskeyPhase: (p) => phases.push(p),
    });
    expect(phases).to.deep.equal(["creating", "signing"]);
  });

  it("second passkey append on same thread: signing only", async () => {
    const { client } = await clientWithMockFetch();
    await client.append(thread, intent);
    const phases: string[] = [];
    await client.append(thread, intent, {
      onThreadPasskeyPhase: (p) => phases.push(p),
    });
    expect(phases).to.deep.equal(["signing"]);
  });

  it("append with mentions: prepare receives candidates; submit content has tokens", async () => {
    const nodeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    let prepareBody: unknown;
    let submitBody: unknown;

    const c = new DevPasskeyConnector({ rootDir: tmp(), seed: "mention" });
    await c.enrollDevice({ userId: "u1", deviceId: "d1" });
    const sess = new IdentitySession(await c.unlock({ userId: "u1", deviceId: "d1" }));
    const mentionIntent: CreateIntent = {
      op: "create",
      type: "comment",
      entityId: crypto.randomUUID(),
      parent: { id: thread.threadId, type: "post" },
      content: { body: "Thanks @alice" },
    };
    const fetchMock = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes("/v1/civic/threads/join")) {
        const personaPubkey = await sess.signingPubkey(thread);
        sess.rememberPersona(thread, personaPubkey);
        return new Response(JSON.stringify({ personaPubkey, personaName: "PhaseAnon" }), { status: 200 });
      }
      if (url.includes("/v1/civic/appends/prepare")) {
        prepareBody = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
          JSON.stringify({
            prevHash: null,
            rootEntityId: thread.threadId,
            mentionNodes: [{ nodeId, userId: "user-alice" }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/v1/civic/appends/submit")) {
        submitBody = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
          JSON.stringify({ txId: "tx-m", entityId: mentionIntent.entityId, txHash: "def" }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const client = new CivicHttpClient({
      baseUrl: "http://localhost",
      session: sess,
      fetch: fetchMock as typeof fetch,
    });

    await client.append(thread, mentionIntent, {
      mentions: [{ kind: "profile", handle: "alice" }],
      mentionSpans: ["@alice"],
    });

    expect(prepareBody).to.deep.include({
      mentions: [{ kind: "profile", handle: "alice" }],
    });
    const content = (submitBody as { content: { body: string } }).content;
    expect(content.body).to.match(/^Thanks <@/);
    expect(content.body).to.not.include("@alice");
  });
});
