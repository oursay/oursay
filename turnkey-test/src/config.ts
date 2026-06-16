import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export interface TurnkeyCredentials {
  organizationId: string;
  apiPublicKey: string;
  apiPrivateKey: string;
  apiKeyName?: string;
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");

function loadEnvFiles(): void {
  dotenv.config({ path: join(repoRoot, ".env") });
  dotenv.config({ path: join(packageRoot, ".env") });
}

function readKeyJson(path: string): Pick<
  TurnkeyCredentials,
  "apiPublicKey" | "apiPrivateKey" | "apiKeyName"
> {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  return {
    apiPublicKey: raw.publicKey,
    apiPrivateKey: raw.privateKey,
    apiKeyName: raw.apiKeyName,
  };
}

function resolveKeyJsonPath(): string | undefined {
  const explicit = process.env.TURNKEY_API_KEY_FILE?.trim();
  if (explicit) {
    const abs = resolve(repoRoot, explicit);
    return existsSync(abs) ? abs : undefined;
  }

  const match = readdirSync(repoRoot).find(
    (name) =>
      name.endsWith(".key.json") && name.startsWith("turnkey-api-credentials-"),
  );
  return match ? join(repoRoot, match) : undefined;
}

export function loadTurnkeyCredentials(): TurnkeyCredentials {
  loadEnvFiles();

  const organizationId = process.env.TURNKEY_ORG_ID?.trim();
  let apiPublicKey = process.env.TURNKEY_API_PUB?.trim();
  let apiPrivateKey = process.env.TURNKEY_API_PRIV?.trim();
  let apiKeyName: string | undefined;

  const keyPath = resolveKeyJsonPath();
  if (keyPath) {
    const fromFile = readKeyJson(keyPath);
    apiPublicKey = fromFile.apiPublicKey ?? apiPublicKey;
    apiPrivateKey = fromFile.apiPrivateKey ?? apiPrivateKey;
    apiKeyName = fromFile.apiKeyName;
  }

  if (!organizationId) {
    throw new Error(
      "Missing TURNKEY_ORG_ID (set in repo root .env or turnkey-test/.env)",
    );
  }
  if (!apiPublicKey || !apiPrivateKey) {
    throw new Error(
      "Missing API key pair. Set TURNKEY_API_PUB/TURNKEY_API_PRIV or place a turnkey-api-credentials-*.key.json at repo root.",
    );
  }

  return {
    organizationId,
    apiPublicKey,
    apiPrivateKey,
    apiKeyName,
  };
}
