import type { PgConfig } from "../config.js";
import { dbNameForChain, immudbPgConfig, ledgerConfig } from "../config.js";
import {
  dropDatabase,
  ensureDatabaseExists,
  listImmudbDatabases,
  PgWireLedgerConnector,
  type PgWireLedgerConnectorOptions,
} from "./pgwire.connector.js";

export interface ForkLineage {
  parentChainId: string;
  forkHeight: number;
  forkReason: string;
}

/**
 * One immudb **instance** (ledgerId) hosting many jurisdiction databases.
 * Callers use this instead of constructing {@link PgWireLedgerConnector} directly.
 */
export class LedgerInstance {
  readonly ledgerId: string;
  private readonly instance: PgConfig;
  private readonly connectors = new Map<string, PgWireLedgerConnector>();
  private readonly forkByChain = new Map<string, ForkLineage>();

  constructor(
    instance: PgConfig = immudbPgConfig,
    ledgerId: string = ledgerConfig.ledgerId,
  ) {
    this.instance = instance;
    this.ledgerId = ledgerId;
  }

  /** Cached connector for `chainId` without connecting (boot-safe when immudb is down). */
  getOrCreateConnector(chainId: string): PgWireLedgerConnector {
    let c = this.connectors.get(chainId);
    if (!c) {
      const fork = this.forkByChain.get(chainId);
      c = new PgWireLedgerConnector({
        instance: this.instance,
        chainId,
        ledgerId: this.ledgerId,
        fork,
      });
      this.connectors.set(chainId, c);
    }
    return c;
  }

  /** Lazy connect + cache one connector per chainId (its own immudb database). */
  async getConnector(chainId: string): Promise<PgWireLedgerConnector> {
    const c = this.getOrCreateConnector(chainId);
    await c.connect();
    return c;
  }

  /**
   * Create (or open) the jurisdiction database, run DDL, write genesis meta (ledgerId + chainId).
   * Idempotent. Optional fork lineage is stored in ledger_meta.
   */
  async createDatabaseFor(
    chainId: string,
    fork?: ForkLineage,
  ): Promise<{ chainId: string; databaseName: string; ledgerId: string }> {
    if (fork) this.forkByChain.set(chainId, fork);
    const databaseName = dbNameForChain(chainId);
    await ensureDatabaseExists(this.instance, databaseName);
    const connector = await this.getConnector(chainId);
    return { chainId, databaseName: connector.databaseName, ledgerId: this.ledgerId };
  }

  /**
   * Close the chain connector (if open) and DROP DATABASE for that jurisdiction only.
   * Returns how drop was performed. Sibling chains are untouched.
   */
  async dropDatabaseFor(chainId: string): Promise<"dropped" | "unsupported"> {
    const existing = this.connectors.get(chainId);
    if (existing) {
      await existing.close();
      this.connectors.delete(chainId);
    }
    this.forkByChain.delete(chainId);
    return dropDatabase(this.instance, dbNameForChain(chainId));
  }

  async listDatabases(): Promise<string[]> {
    return listImmudbDatabases(this.instance);
  }

  /** Close every cached connector. */
  async close(): Promise<void> {
    const all = [...this.connectors.values()];
    this.connectors.clear();
    await Promise.all(all.map((c) => c.close()));
  }
}

export type { PgWireLedgerConnectorOptions };
