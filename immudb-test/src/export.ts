import { canonicalJson } from "./commitment.js";
import { hashLeaf, merkleProof, merkleRoot } from "./merkle.js";
import { readRoot, type ImmuClient } from "./immudb.js";
import type { PrivateStore } from "./privateStore.js";
import type { BundleEntry, PublicBundle, PublicEnvelope } from "./types.js";

/**
 * Build the public audit bundle we would publish (e.g. to a GitHub repo):
 *   - every public envelope (commitments only),
 *   - a Merkle inclusion proof per entry against an app-level Merkle root,
 *   - plaintext reveal ONLY for non-redacted / non-erased entries,
 *   - an anchor binding both the immudb root and the bundle Merkle root.
 *
 * Redacted/erased entries still appear (envelope + hash + proof) so the dataset stays
 * complete and verifiable — only their plaintext is withheld.
 */
export async function buildBundle(
  immu: ImmuClient,
  priv: PrivateStore,
  keys: string[],
): Promise<PublicBundle> {
  const sortedKeys = [...new Set(keys)].sort();

  // Verified read-back of each envelope (also re-verifies inclusion vs immudb's root).
  const envelopes: PublicEnvelope[] = [];
  for (const key of sortedKeys) {
    const entry = await immu.verifiedGet({ key });
    if (!entry) throw new Error(`missing ledger entry for ${key}`);
    envelopes.push(JSON.parse(entry.value) as PublicEnvelope);
  }

  const leaves = envelopes.map((e) => hashLeaf(canonicalJson(e)));
  const root = merkleRoot(leaves);

  const entries: BundleEntry[] = [];
  for (let i = 0; i < sortedKeys.length; i++) {
    const envelope = envelopes[i];
    const revealable = await priv.isRevealable(envelope.id);
    let reveal: BundleEntry["reveal"];
    if (revealable) {
      const c = await priv.getContent(envelope.id);
      if (c && c.salt != null && c.content != null) reveal = { salt: c.salt, content: c.content };
    }
    entries.push({
      key: sortedKeys[i],
      envelope,
      leafHash: leaves[i],
      merkleProof: merkleProof(leaves, i),
      ...(reveal ? { reveal } : {}),
    });
  }

  const immudbRoot = await readRoot(immu);
  const bundle: PublicBundle = {
    anchor: {
      v: 1,
      ledgerDb: immudbRoot.db,
      capturedAt: new Date().toISOString(),
      txCount: entries.length,
      immudbRoot: { txid: immudbRoot.txid, txhashHex: immudbRoot.txhashHex },
      bundleMerkleRoot: root,
    },
    entries,
  };
  return bundle;
}
