import { randomUUID } from "node:crypto";
import { canonicalJson, contentCommitment, newSalt } from "./commitment.js";
import type { ImmuClient } from "./immudb.js";
import type { PrivateStore } from "./privateStore.js";
import type { PublicEnvelope, RecordType } from "./types.js";

export function keyFor(type: RecordType, id: string): string {
  return `${type}:${id}`;
}

export interface AppendInput {
  type: RecordType;
  id?: string;
  parentId?: string;
  authorRef: string;
  content: unknown;
  createdAt?: string;
}

export interface AppendResult {
  id: string;
  key: string;
  envelope: PublicEnvelope;
  salt: string;
}

/**
 * High-level OurSay ledger: writes a hiding commitment + public envelope to the
 * verifiable immudb ledger, and stashes the raw content + salt in the private store.
 */
export class Ledger {
  /** Keys appended in this session — used to enumerate for export/audit. */
  readonly keys: string[] = [];

  constructor(
    private readonly immu: ImmuClient,
    private readonly priv: PrivateStore,
  ) {}

  async append(input: AppendInput): Promise<AppendResult> {
    const id = input.id ?? randomUUID();
    const salt = newSalt();
    const createdAt = input.createdAt ?? new Date().toISOString();
    const contentHash = contentCommitment({ id, salt, content: input.content });

    const envelope: PublicEnvelope = {
      v: 1,
      type: input.type,
      id,
      ...(input.parentId ? { parentId: input.parentId } : {}),
      authorRef: input.authorRef,
      createdAt,
      contentHash,
    };

    // Raw content -> private (erasable) store. Commitment -> public (append-only) ledger.
    await this.priv.putContent({ id, salt, content: input.content });
    const key = keyFor(input.type, id);
    await this.immu.verifiedSet({ key, value: canonicalJson(envelope) });
    this.keys.push(key);

    return { id, key, envelope, salt };
  }

  /** Verified read of a public envelope (throws if immudb's proof fails). */
  async get(key: string): Promise<PublicEnvelope> {
    const entry = await this.immu.verifiedGet({ key });
    if (!entry) throw new Error(`no entry for ${key}`);
    return JSON.parse(entry.value) as PublicEnvelope;
  }
}
