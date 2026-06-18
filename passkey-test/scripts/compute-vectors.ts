// One-off: print the deterministic outputs to bake into vectors.ts EXPECT. Run with:
//   npx tsx scripts/compute-vectors.ts
import { deriveThreadKey } from "../src/derive.js";
import { signEnvelope } from "../src/envelope.js";
import { threadCommitment } from "../src/commitment.js";
import {
  levelMaster, USER_ID, THREAD_ID, LEVEL, SALT_T_HEX, CONTENT_HASH, envFixture,
} from "../src/vectors.js";

const key = deriveThreadKey({ levelMaster: levelMaster(), threadId: THREAD_ID, level: LEVEL });
const signed = signEnvelope(envFixture(), key.privKey);
const commitment = threadCommitment({ userId: USER_ID, saltT: SALT_T_HEX, threadId: THREAD_ID, level: LEVEL });

console.log(JSON.stringify({
  contentHash: CONTENT_HASH,
  threadPubkey: key.threadPubkey,
  signature: signed.envelope.signature,
  txHash: signed.txHash,
  commitment,
}, null, 2));
