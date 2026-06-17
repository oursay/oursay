import { execFileSync } from "node:child_process";
import { expect } from "chai";
import { immudbConfig, immudbDataVolume, paths } from "../src/config.js";
import { connectLedger, readRoot, seedTrustedRoot } from "../src/immudb.js";
import { PrivateStore } from "../src/privateStore.js";
import { Ledger } from "../src/ledger.js";
import { pgConfig } from "../src/config.js";

/**
 * REAL on-disk corruption (@physical, opt-in: `npm run test:physical`).
 *
 * This is intentionally excluded from the default run because its failure mode is
 * NON-DETERMINISTIC: depending on which bytes are hit, immudb may refuse to start,
 * return an I/O error, or surface a verification failure. The point is to show that
 * physical tampering does not go silently accepted. It is flaky by nature — the
 * deterministic guarantee lives in 03-tamper-forged-state.
 *
 * The test corrupts immudb's data volume from a throwaway busybox container (no host
 * bind mount, so it works on Windows), then rebuilds the volume afterwards so the
 * stack is left healthy for other runs.
 */
function docker(args: string[]): { ok: boolean; out: string } {
  try {
    const out = execFileSync("docker", args, { cwd: paths.packageRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: String((e as { stderr?: string }).stderr ?? e) };
  }
}

describe("04 tamper detection: physical on-disk corruption @physical", () => {
  it("surfaces an error (won't start / read fails) after corrupting the data volume", async function () {
    this.timeout(180000);

    // 1. Write a record and capture the honest pre-tamper root.
    const immu = await connectLedger(immudbConfig);
    const priv = new PrivateStore(pgConfig);
    await priv.init();
    const ledger = new Ledger(immu, priv);
    const r = await ledger.append({ type: "post", authorRef: "alice", content: { text: "pre-tamper" } });
    const honestRoot = await readRoot(immu);
    await priv.close();

    // 2. Stop immudb so the volume is not held open.
    expect(docker(["compose", "stop", "immudb"]).ok, "stop immudb").to.equal(true);

    // 3. Corrupt the largest data file inside the named volume.
    const corrupt = docker([
      "run", "--rm", "-v", `${immudbDataVolume}:/data`, "busybox", "sh", "-c",
      'f=$(find /data -type f -exec ls -S {} + 2>/dev/null | head -1); echo "target=$f"; ' +
        'dd if=/dev/urandom of="$f" bs=1 seek=8 count=256 conv=notrunc 2>/dev/null; echo corrupted',
    ]);
    expect(corrupt.ok, `corrupt sidecar: ${corrupt.out}`).to.equal(true);

    // 4. Try to bring immudb back and read the entry against the honest root.
    const restart = docker(["compose", "up", "-d", "--wait", "immudb"]);

    let tamperSurfaced = false;
    if (!restart.ok) {
      // immudb refused to come healthy with corrupted storage — tamper surfaced.
      tamperSurfaced = true;
    } else {
      try {
        const immu2 = await connectLedger(immudbConfig);
        seedTrustedRoot(immu2, honestRoot); // auditor trusts only the pre-tamper anchor
        const entry = await immu2.verifiedGet({ key: r.key }).catch(() => undefined);
        // Tamper surfaced if the read failed, returned nothing, or returned altered bytes.
        if (!entry || JSON.parse(entry.value).id !== r.id) tamperSurfaced = true;
      } catch {
        tamperSurfaced = true;
      }
    }

    // 5. Rebuild the volume so the stack is healthy for subsequent runs.
    docker(["compose", "down", "-v"]);
    docker(["compose", "up", "-d", "--wait", "immudb", "postgres"]);

    expect(tamperSurfaced, "physical corruption should not be silently accepted").to.equal(true);
  });
});
