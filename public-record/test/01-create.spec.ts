import { expect } from "chai";
import { getWorld, settleAll } from "./helpers/world.js";

/**
 * Create the three root entity types. The append-only chain (immudb) holds ONLY commitments
 * + public metadata; the raw content lives in the private Postgres store.
 */
describe("01 create: roots — commitments on the chain, content in Postgres", () => {
  it("creates a post; immudb stores no plaintext, Postgres stores the content", async () => {
    const { svc, store, connector } = await getWorld();
    const ref = await svc.create({ type: "post", author: "alice", content: { title: "Test post", body: "secret civic text" } });
    await settleAll(); // pooled on append; reaches immudb only at settlement

    const envelope = await connector.getEnvelope(ref.txId);
    expect(envelope, "row present in immudb").to.exist;
    expect(envelope!).to.not.include("secret civic text");
    expect(envelope!, "envelope carries the commitment, not the text").to.include("contentHash");

    const state = await store.getEntityState(ref.entityId);
    expect(state!.type).to.equal("post");
    expect(state!.latestOp).to.equal("create");
    expect((state!.content as { body: string }).body).to.equal("secret civic text");
  });

  it("verifies the committed row server-side via immudb_verify_row()", async () => {
    const { svc, connector } = await getWorld();
    const ref = await svc.create({ type: "post", author: "bob", content: { title: "Test post", body: "verify me" } });
    await settleAll();
    const v = await connector.verifyRow(ref.txId);
    expect(v.verified, "immudb_verify_row reports verified").to.equal(true);
    expect(v.provenance).to.equal("server");
  });

  it("creates a petition and a poll, carrying their governance rules in content", async () => {
    const { svc, store } = await getWorld();
    const petition = await svc.create({
      type: "petition",
      author: "alice",
      content: { title: "Fix the road", text: "Please fix Main St.", rules: { appliesToDistrictIds: ["edmonton-strathcona-2026"] } },
    });
    const poll = await svc.create({
      type: "poll",
      author: "alice",
      content: { question: "Fix the road?", options: ["yes", "no"], rules: { allowChange: true } },
    });

    const ps = await store.getEntityState(petition.entityId);
    const qs = await store.getEntityState(poll.entityId);
    expect(ps!.type).to.equal("petition");
    expect(qs!.type).to.equal("poll");
    expect((qs!.content as { options: string[] }).options).to.deep.equal(["yes", "no"]);
  });
});
