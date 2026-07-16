import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { FileAnchorTarget } from "../src/anchor/file.target.js";
import { everyNBlocks, type AnchorTarget } from "../src/anchor/target.js";
import type { PrivateStore } from "../src/private/store.js";
import { freshChainWorld, getWorld } from "./helpers/world.js";

/**
 * Minimal public-witness stub: same publish surface as file, but advances
 * `anchor_publish_cursor` via AnchorPublisher when `publicWitness` is true.
 */
class PublicWitnessFileTarget extends FileAnchorTarget {
  override readonly kind = "evm";
  override readonly publicWitness = true;
}

describe("externallyAnchored: public-witness tip vs file-only publish", () => {
  let store: PrivateStore;

  before(async () => {
    store = (await getWorld()).store;
  });

  beforeEach(async () => {
    await store.reset();
  });

  it("file publish does not light the flag; publicWitness publish does", async () => {
    const { svc, settler, publisher } = await freshChainWorld();
    const created = await svc.create({
      type: "post",
      author: "alice",
      content: { title: "Anchored?", body: "body" },
    });
    const entityId = created.entityId;

    let flags = await store.getExternallyAnchoredFlags([entityId]);
    expect(flags.get(entityId), "pending → false").to.equal(false);

    await settler.settleBlock();
    flags = await store.getExternallyAnchoredFlags([entityId]);
    expect(flags.get(entityId), "settled but no public tip → false").to.equal(false);

    const fileDir = mkdtempSync(join(tmpdir(), "oursay-file-anchor-"));
    const fileTarget: AnchorTarget = new FileAnchorTarget(fileDir, everyNBlocks(1));
    await publisher.publish(fileTarget);
    flags = await store.getExternallyAnchoredFlags([entityId]);
    expect(flags.get(entityId), "file target is not publicWitness → false").to.equal(false);

    const publicDir = mkdtempSync(join(tmpdir(), "oursay-public-anchor-"));
    const publicTarget: AnchorTarget = new PublicWitnessFileTarget(publicDir, everyNBlocks(1));
    // File tip already at 1; public target starts empty — republish height 1 to the public stub.
    await publisher.publish(publicTarget);
    flags = await store.getExternallyAnchoredFlags([entityId]);
    expect(flags.get(entityId), "publicWitness tip covers block → true").to.equal(true);
  });

  it("entity above the public tip stays false", async () => {
    const { svc, settler, publisher } = await freshChainWorld();
    const a = await svc.create({
      type: "post",
      author: "alice",
      content: { title: "A", body: "a" },
    });
    await settler.settleBlock();

    const publicDir = mkdtempSync(join(tmpdir(), "oursay-public-tip-"));
    await publisher.publish(new PublicWitnessFileTarget(publicDir, everyNBlocks(1)));

    const b = await svc.create({
      type: "post",
      author: "alice",
      content: { title: "B", body: "b" },
    });
    await settler.settleBlock();
    // Tip still at height 1; B is in block 2.

    const flags = await store.getExternallyAnchoredFlags([a.entityId, b.entityId]);
    expect(flags.get(a.entityId)).to.equal(true);
    expect(flags.get(b.entityId)).to.equal(false);
  });
});
