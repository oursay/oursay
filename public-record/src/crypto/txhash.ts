// txHashOf — the transaction hash: hash of the canonical envelope. It is a revision's identity and the
// value the next same-entity transaction references as `prevHash`. This lives in a PURE leaf module
// (only canonical JSON + Merkle leaf hashing) so the on-device signing path (envelope.ts, device.ts)
// can be bundled for the browser without dragging in `ledger/chain.ts` → `config.ts` (dotenv, node:*).
// `ledger/chain.ts` re-exports this to preserve the `@oursay/public-record/ledger/chain` surface.

import { canonicalJson } from "./commitment.js";
import { hashLeaf } from "./merkle.js";
import type { TxEnvelope } from "../schema/types.js";

export function txHashOf(envelope: TxEnvelope): string {
  return hashLeaf(canonicalJson(envelope));
}
