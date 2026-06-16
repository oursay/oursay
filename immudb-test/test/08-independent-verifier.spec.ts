import { join } from "node:path";
import { rmSync } from "node:fs";
import { expect } from "chai";
import { getWorld } from "./helpers/world.js";
import { buildBundle } from "../src/export.js";
import { verifyBundle } from "../src/verifier.js";
import { paths } from "../src/config.js";
import { appendAnchorFile, readLatestAnchoredRoot } from "../src/anchor-github.js";

/**
 * The payoff: an INDEPENDENT, OFFLINE auditor validates the published bundle using only
 * the externally-anchored Merkle root (read back from the "GitHub" file) — never trusting
 * the live server. Revealed entries verify by recomputing their commitment; redacted/erased
 * entries verify by hash alone. Any tampering, or a root that doesn't match the anchor, is
 * rejected.
 */
describe("08 independent verifier: offline audit against the anchored root", () => {
  it("validates revealed + redacted entries with no live server connection", async () => {
    const { immu, ledger, priv } = await getWorld();
    const a = await ledger.append({ type: "post", authorRef: "alice", content: { text: "public A" } });
    const b = await ledger.append({ type: "comment", authorRef: "bob", content: { text: "redact B" } });
    const c = await ledger.append({ type: "vote", parentId: "poll-z", authorRef: "carol", content: { option: "no" } });
    await priv.redact(b.id);

    const bundle = await buildBundle(immu, priv, [a.key, b.key, c.key]);

    // Anchor independently (write to the public file), then fetch the root back.
    const anchorsPath = join(paths.outDir, "anchors-audit.jsonl");
    rmSync(anchorsPath, { force: true });
    appendAnchorFile(anchorsPath, bundle.anchor);
    const anchoredRoot = readLatestAnchoredRoot(anchorsPath);

    const report = verifyBundle(bundle, anchoredRoot);
    expect(report.ok).to.equal(true);
    expect(report.rootMatches).to.equal(true);
    const statuses = Object.fromEntries(report.verdicts.map((v) => [v.id, v.status]));
    expect(statuses[a.id]).to.equal("revealed");
    expect(statuses[b.id]).to.equal("redacted");
    expect(statuses[c.id]).to.equal("revealed");
  });

  it("rejects a tampered envelope", async () => {
    const { immu, ledger, priv } = await getWorld();
    const r = await ledger.append({ type: "post", authorRef: "alice", content: { text: "honest" } });
    const bundle = await buildBundle(immu, priv, [r.key]);

    const tampered = structuredClone(bundle);
    tampered.entries[0].envelope.authorRef = "mallory";

    const report = verifyBundle(tampered, bundle.anchor.bundleMerkleRoot);
    expect(report.ok).to.equal(false);
    expect(report.verdicts[0].ok).to.equal(false);
  });

  it("rejects when the bundle root does not match the anchored root", async () => {
    const { immu, ledger, priv } = await getWorld();
    const r = await ledger.append({ type: "post", authorRef: "alice", content: { text: "honest" } });
    const bundle = await buildBundle(immu, priv, [r.key]);

    const wrongAnchor = "f".repeat(64);
    const report = verifyBundle(bundle, wrongAnchor);
    expect(report.ok).to.equal(false);
    expect(report.rootMatches).to.equal(false);
  });
});
