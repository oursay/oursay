// DevPasskeyConnector — a SIMULATED passkey for dev + CI. No browser, no Touch ID, no prompts.
//
// DANGER: never enable in production. The constructor throws unless `OURSAY_DEV_PASSKEY === "1"`
// AND `NODE_ENV !== "production"`. The name is deliberately loud.
//
// Custody: device/user secrets persist under `.oursay-dev/` at the repo root (separate from the
// Postgres/immudb volumes). With a fixed `seed`, all material derives deterministically from ids
// (HKDF), so tests get frozen vectors and a full wipe leaves nothing behind. `destroyAll()` removes
// the whole directory — part of the one "clean slate" story (also: `store.reset()`, `db:down -v`).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils";
import { p256 } from "@noble/curves/p256";
import { bytesToNumberBE, numberToBytesBE } from "@noble/curves/abstract/utils";
import type { DeviceCredential, PasskeyConnector, UnlockedSession } from "./connector.js";

const ENV_FLAG = "OURSAY_DEV_PASSKEY";

/** HKDF-Expand to a valid P-256 private scalar in [1, n-1] (same pinned mapping as derive.ts). */
function p256PrivFrom(ikm: Uint8Array, info: string): Uint8Array {
  const okm = hkdf(sha256, ikm, utf8ToBytes("oursay/dev/p256"), utf8ToBytes(info), 48);
  const n = p256.CURVE.n;
  return numberToBytesBE((bytesToNumberBE(okm) % (n - 1n)) + 1n, 32);
}

/** A 32-byte HKDF secret, domain-separated by `salt`+`info`. */
function root32(ikm: Uint8Array, salt: string, info: string): Uint8Array {
  return hkdf(sha256, ikm, utf8ToBytes(salt), utf8ToBytes(info), 32);
}

/** Walk up from `start` to the repo root (the dir whose package.json declares `workspaces`). */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        if (typeof JSON.parse(readFileSync(pkg, "utf8")).workspaces !== "undefined") return dir;
      } catch {
        /* keep walking */
      }
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return start;
}

interface UserFile {
  userId: string;
  /** 32-byte user root (hex). User-level masters/nullifier-roots derive from this. */
  userRootHex: string;
}
interface DeviceFile {
  userId: string;
  deviceId: string;
  deviceRootHex: string;
  devicePubkey: string;
  label?: string;
}

export interface DevPasskeyOptions {
  /** Override the custody dir. Default: `<repoRoot>/.oursay-dev` (or `$OURSAY_DEV_DIR`). */
  rootDir?: string;
  /** Deterministic seed: when set, all secrets derive from (seed, ids) for frozen vectors. */
  seed?: string;
}

export class DevPasskeyConnector implements PasskeyConnector {
  readonly mode = "dev" as const;
  private readonly rootDir: string;
  private readonly seed?: Uint8Array;

  constructor(opts: DevPasskeyOptions = {}) {
    if (process.env[ENV_FLAG] !== "1") {
      throw new Error(`DevPasskeyConnector is disabled: set ${ENV_FLAG}=1 to use the simulated passkey (dev/CI only)`);
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error("DevPasskeyConnector must never run with NODE_ENV=production");
    }
    this.rootDir = opts.rootDir ?? process.env.OURSAY_DEV_DIR ?? join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), ".oursay-dev");
    this.seed = opts.seed ? utf8ToBytes(opts.seed) : undefined;
  }

  /** The custody directory in use (so a reset script / test can target the exact path). */
  get directory(): string {
    return this.rootDir;
  }

  async enrollDevice(o: { userId: string; label?: string; deviceId?: string }): Promise<DeviceCredential> {
    this.ensureUser(o.userId);
    const deviceId = o.deviceId ?? (this.seed ? `dev-${o.userId}-0` : randomUUID());
    const deviceRoot = this.seed
      ? root32(this.seed, "oursay/dev/device-root", `${o.userId}:${deviceId}`)
      : randomBytes(32);
    const devicePubkey = bytesToHex(p256.getPublicKey(p256PrivFrom(deviceRoot, `account|${o.userId}`)));
    const file: DeviceFile = { userId: o.userId, deviceId, deviceRootHex: bytesToHex(deviceRoot), devicePubkey, label: o.label };
    this.writeJson(this.devicePath(o.userId, deviceId), file);
    return { userId: o.userId, deviceId, devicePubkey };
  }

  async unlock(o: { userId: string; deviceId: string }): Promise<UnlockedSession> {
    const userRoot = hexToBytes(this.readUser(o.userId).userRootHex);
    const device = this.readDevice(o.userId, o.deviceId);
    const deviceRoot = hexToBytes(device.deviceRootHex);
    return {
      userId: o.userId,
      deviceId: o.deviceId,
      devicePubkey: device.devicePubkey,
      deviceRoot,
      levelMaster: (level: string) => root32(userRoot, "oursay/dev/level-master", level),
      nullifierRoot: (level: string) => root32(userRoot, "oursay/dev/nullifier-root", level),
    };
  }

  /** Wipe ALL dev passkey material (the `.oursay-dev/` directory). Idempotent. */
  destroyAll(): void {
    rmSync(this.rootDir, { recursive: true, force: true });
  }

  // ── custody helpers ──────────────────────────────────────────────────────────────────────

  private ensureUser(userId: string): UserFile {
    const path = this.userPath(userId);
    if (existsSync(path)) return this.readUser(userId);
    const userRoot = this.seed ? root32(this.seed, "oursay/dev/user-root", userId) : randomBytes(32);
    const file: UserFile = { userId, userRootHex: bytesToHex(userRoot) };
    this.writeJson(path, file);
    return file;
  }

  private readUser(userId: string): UserFile {
    const path = this.userPath(userId);
    if (!existsSync(path)) throw new Error(`DevPasskeyConnector: unknown user '${userId}' (enroll a device first)`);
    return JSON.parse(readFileSync(path, "utf8")) as UserFile;
  }

  private readDevice(userId: string, deviceId: string): DeviceFile {
    const path = this.devicePath(userId, deviceId);
    if (!existsSync(path)) throw new Error(`DevPasskeyConnector: unknown device '${deviceId}' for user '${userId}'`);
    return JSON.parse(readFileSync(path, "utf8")) as DeviceFile;
  }

  private userPath(userId: string): string {
    return join(this.rootDir, safe(userId), "user.json");
  }
  private devicePath(userId: string, deviceId: string): string {
    return join(this.rootDir, safe(userId), "devices", `${safe(deviceId)}.json`);
  }
  private writeJson(path: string, value: unknown): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2));
  }
}

/** Keep ids filesystem-safe (uuids and slugs are fine; defend against stray separators). */
function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Convenience: the default custody dir without constructing a connector (for reset scripts). */
export function defaultDevDir(): string {
  return process.env.OURSAY_DEV_DIR ?? join(findRepoRoot(resolve(process.cwd())), ".oursay-dev");
}
