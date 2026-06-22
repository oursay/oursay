import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { JurisdictionConfig } from "./jurisdiction.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");

// Load repo-root .env first, then package-local .env (local overrides root).
dotenv.config({ path: join(repoRoot, ".env") });
dotenv.config({ path: join(packageRoot, ".env") });

function env(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback;
}

export interface PgConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/** immudb 1.11.0 reached over its PostgreSQL wire protocol — the public append-only chain. */
export const immudbPgConfig: PgConfig = {
  host: env("IMMUDB_PG_HOST", "127.0.0.1"),
  port: Number(env("IMMUDB_PG_PORT", "5443")),
  user: env("IMMUDB_PG_USER", "immudb"),
  password: env("IMMUDB_PG_PASSWORD", "immudb"),
  database: env("IMMUDB_PG_DATABASE", "defaultdb"),
};

/** Postgres — the private, mutable store (record_tx event log + raw content). */
export const pgConfig: PgConfig = {
  host: env("PGHOST", "127.0.0.1"),
  port: Number(env("PGPORT", "5442")),
  user: env("PGUSER", "oursay"),
  password: env("PGPASSWORD", "oursay"),
  database: env("PGDATABASE", "oursay_public_record"),
};

/**
 * Outbox relay retry policy (the "3-3-3" default). When a relay to immudb fails, the relay
 * healthchecks immudb and: if healthy, retries the delivery `retryAttempts` times; if unhealthy,
 * waits `healthcheckWaitMs` and re-healthchecks up to `healthcheckAttempts` times.
 *
 * A count of **0 means indefinite** — keep retrying / re-healthchecking until it succeeds (used to
 * ride out an arbitrarily long immudb outage). `healthcheckWaitMs` is configured in MINUTES via
 * env; 0 minutes = re-healthcheck with no delay.
 */
export interface OutboxConfig {
  retryAttempts: number; // relay retries while immudb is healthy (0 = indefinite)
  healthcheckWaitMs: number; // delay between healthchecks while immudb is down
  healthcheckAttempts: number; // healthchecks before giving up while down (0 = indefinite)
}

export const outboxConfig: OutboxConfig = {
  retryAttempts: Number(env("OUTBOX_RETRY_ATTEMPTS", "3")),
  healthcheckWaitMs: Number(env("OUTBOX_HEALTHCHECK_WAIT_MINUTES", "3")) * 60_000,
  healthcheckAttempts: Number(env("OUTBOX_HEALTHCHECK_ATTEMPTS", "3")),
};

/**
 * The chain (genesis/network) identity. immudb is append-only and never reset, so block headers are
 * keyed by `(chainId, blockHeight)`: a stable `chainId` per deployment, a fresh one per test/seed run
 * (see BLOCKS_DDL). Stages 2–3 (consortium / open network) replace this single id with an on-record,
 * agreed genesis — the seam is the same.
 */
export interface ChainConfig {
  chainId: string;
}

export const chainConfig: ChainConfig = {
  chainId: env("CHAIN_ID", "oursay-local"),
};

/**
 * The deployment's default JURISDICTION — the domain partition for civic identity and gating rules
 * (docs/01 §6.0). A jurisdiction is 1:1 with a chain, so its `id` defaults to the chain's `chainId`
 * value (e.g. `ab-ca-gov`); `level` is descriptive metadata (federal/provincial/municipal/state/…);
 * `rules` are the default gates an entity may override within (see governance.ts `resolveRules`).
 * The full type + the router live in jurisdiction.ts. Default rules are FINAL-action semantics
 * (no change/revoke) — the real-world analog — unless a deployment opts in.
 */
export const jurisdictionConfig: JurisdictionConfig = {
  id: env("JURISDICTION_ID", chainConfig.chainId),
  level: env("JURISDICTION_LEVEL", "federal"),
  rules: {
    allowChange: env("JURISDICTION_ALLOW_CHANGE", "false") === "true",
    allowRevoke: env("JURISDICTION_ALLOW_REVOKE", "false") === "true",
  },
};

/**
 * Block SETTLEMENT trigger policy. A block is cut from the pending pool when there is at least
 * `minTxs` (always ≥ 1, so we never settle an empty block) AND either the count threshold OR the
 * age threshold is met — whichever comes first:
 *   - `maxPending` (N): settle once this many txs have accumulated unsettled. **0 disables** this
 *     dimension (rely on age alone).
 *   - `maxPendingAgeMs` (X): settle once the OLDEST unsettled tx has waited this long — the quiet-
 *     period fallback so the record is never left unsettled indefinitely. Configured in HOURS via
 *     env, stored in ms. **0 disables** this dimension. This is a cadence trigger only; it decides
 *     *when* to cut a block, never transaction order/eligibility (doc 07 §3.2).
 * A block is capped at `maxBlockTxs` rows; a larger backlog settles across several blocks.
 */
export interface BlockConfig {
  maxPending: number; // N — count trigger (0 = disabled)
  maxPendingAgeMs: number; // X — age trigger, ms (0 = disabled)
  maxBlockTxs: number; // hard cap on txs per settled block
  minTxs: number; // minimum pending to settle (clamped to ≥ 1)
}

export const blockConfig: BlockConfig = {
  maxPending: Number(env("BLOCK_MAX_PENDING", "250")),
  maxPendingAgeMs: Number(env("BLOCK_MAX_PENDING_AGE_HOURS", "12")) * 3_600_000,
  maxBlockTxs: Number(env("BLOCK_MAX_TXS", "250")),
  minTxs: Math.max(1, Number(env("BLOCK_MIN_TXS", "1"))),
};

/**
 * Per-target external-anchor publish cadence. Settlement (above) and publication are separate
 * phases: a block is settled to the chain on the trigger policy, then replicated to each anchor
 * target on its own cadence. The file target publishes every `fileEveryNBlocks` settled blocks
 * (still in order, no gaps — see AnchorPublisher).
 */
export interface AnchorTargetsConfig {
  fileEveryNBlocks: number;
}

export const anchorTargetsConfig: AnchorTargetsConfig = {
  fileEveryNBlocks: Math.max(1, Number(env("FILE_ANCHOR_EVERY_BLOCKS", "2"))),
};

/**
 * Identity / platform binding. The platform signs each per-thread registration binding (§6) with a
 * P-256 key. This is **env-required with NO committed default** (VALUES §9: no secrets in git): a
 * deployment sets `PLATFORM_BINDING_PRIVKEY` (hex), and tests generate an ephemeral key per run and
 * inject it. KMS-managed keys are a later milestone. Empty string when unset — `signBinding` and the
 * `appendSigned` gate fail loudly rather than signing/verifying with a placeholder.
 */
export interface IdentityConfig {
  platformBindingPrivKeyHex: string;
  /** Reject a signed envelope at commit if `serverNow - createdAt` exceeds this many seconds.
   *  `0` disables the freshness gate (today's behavior — no rejection). Default 120 (dev). */
  signedEnvelopeMaxAgeSec: number;
  /** Tolerance (seconds) for a client clock running slightly fast: an envelope whose `createdAt` is
   *  ahead of server time by at most this much is accepted; beyond it is rejected as clock skew. */
  signedEnvelopeFutureSkewSec: number;
  /** Production hardening (Method 3 §5.4): when true, `appendSigned` requires a thread-scoped
   *  `signerPubkey` (device-signed) and rejects the persona-signs path. Default false so dev/tests
   *  and the passkey-sync path (where the persona signs directly) keep working. */
  requireDeviceSigner: boolean;
}

export const identityConfig: IdentityConfig = {
  platformBindingPrivKeyHex: env("PLATFORM_BINDING_PRIVKEY", ""),
  signedEnvelopeMaxAgeSec: Number(env("SIGNED_ENVELOPE_MAX_AGE_SEC", "120")),
  signedEnvelopeFutureSkewSec: Number(env("SIGNED_ENVELOPE_FUTURE_SKEW_SEC", "60")),
  requireDeviceSigner: env("REQUIRE_DEVICE_SIGNER", "false") === "true",
};

export const paths = { packageRoot, repoRoot };
