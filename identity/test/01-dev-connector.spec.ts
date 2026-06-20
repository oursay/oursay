// DevPasskeyConnector (no DB): env guard, determinism, custody persistence, full wipe.
import { expect } from "chai";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bytesToHex } from "@noble/hashes/utils";
import { DevPasskeyConnector } from "../src/client/dev-connector.js";

process.env.OURSAY_DEV_PASSKEY = "1";

const tmp = () => mkdtempSync(join(tmpdir(), "oursay-dev-"));

describe("01 dev-connector: simulated passkey (env-guarded, deterministic, wipeable)", () => {
  it("refuses to construct without OURSAY_DEV_PASSKEY=1", () => {
    const saved = process.env.OURSAY_DEV_PASSKEY;
    delete process.env.OURSAY_DEV_PASSKEY;
    try {
      expect(() => new DevPasskeyConnector({ rootDir: tmp() })).to.throw(/OURSAY_DEV_PASSKEY/);
    } finally {
      process.env.OURSAY_DEV_PASSKEY = saved;
    }
  });

  it("refuses to run under NODE_ENV=production", () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => new DevPasskeyConnector({ rootDir: tmp() })).to.throw(/production/);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });

  it("is deterministic for a fixed seed + ids (frozen-vector friendly)", async () => {
    const a = new DevPasskeyConnector({ rootDir: tmp(), seed: "vec" });
    const b = new DevPasskeyConnector({ rootDir: tmp(), seed: "vec" });
    const ca = await a.enrollDevice({ userId: "u1", deviceId: "d1" });
    const cb = await b.enrollDevice({ userId: "u1", deviceId: "d1" });
    expect(ca.devicePubkey).to.equal(cb.devicePubkey);
    const sa = await a.unlock({ userId: "u1", deviceId: "d1" });
    const sb = await b.unlock({ userId: "u1", deviceId: "d1" });
    expect(bytesToHex(sa.deviceRoot)).to.equal(bytesToHex(sb.deviceRoot));
    expect(bytesToHex(sa.levelMaster("federal"))).to.equal(bytesToHex(sb.levelMaster("federal")));
    expect(bytesToHex(sa.nullifierRoot("federal"))).to.equal(bytesToHex(sb.nullifierRoot("federal")));
    expect(bytesToHex(sa.levelMaster("provincial"))).to.not.equal(bytesToHex(sa.levelMaster("federal")));
  });

  it("two devices of one user share user-level secrets but differ at the device root", async () => {
    const c = new DevPasskeyConnector({ rootDir: tmp(), seed: "vec" });
    await c.enrollDevice({ userId: "u1", deviceId: "d1" });
    await c.enrollDevice({ userId: "u1", deviceId: "d2" });
    const s1 = await c.unlock({ userId: "u1", deviceId: "d1" });
    const s2 = await c.unlock({ userId: "u1", deviceId: "d2" });
    expect(bytesToHex(s1.deviceRoot)).to.not.equal(bytesToHex(s2.deviceRoot));
    expect(s1.devicePubkey).to.not.equal(s2.devicePubkey);
    expect(bytesToHex(s1.levelMaster("federal"))).to.equal(bytesToHex(s2.levelMaster("federal")));
    expect(bytesToHex(s1.nullifierRoot("federal"))).to.equal(bytesToHex(s2.nullifierRoot("federal")));
  });

  it("persists custody so a fresh connector instance can unlock", async () => {
    const dir = tmp();
    const enroller = new DevPasskeyConnector({ rootDir: dir }); // random (non-seeded)
    const cred = await enroller.enrollDevice({ userId: "alice", label: "phone" });
    const reopened = new DevPasskeyConnector({ rootDir: dir });
    const s = await reopened.unlock({ userId: "alice", deviceId: cred.deviceId });
    expect(s.devicePubkey).to.equal(cred.devicePubkey);
    expect(s.deviceRoot.length).to.equal(32);
  });

  it("destroyAll() wipes the custody directory (clean slate)", async () => {
    const dir = tmp();
    const c = new DevPasskeyConnector({ rootDir: dir });
    await c.enrollDevice({ userId: "bob", deviceId: "d1" });
    expect(existsSync(dir)).to.equal(true);
    c.destroyAll();
    expect(existsSync(dir)).to.equal(false);
  });
});
