// One-off: print the deterministic identity vectors to bake into test/fixtures/identity-vectors.ts
// EXPECT. Run with: npx tsx scripts/compute-identity-vectors.ts
import { deriveThreadKey } from "../src/identity/derive.js";
import { signEnvelope } from "../src/identity/envelope.js";
import { threadCommitment } from "../src/crypto/commitment.js";
import {
  jurisdictionMaster, USER_ID, THREAD_ID, JURISDICTION, SALT_T_HEX, CONTENT_HASH, envFixture,
} from "../test/fixtures/identity-vectors.js";

const key = deriveThreadKey({ jurisdictionMaster: jurisdictionMaster(), threadId: THREAD_ID, jurisdiction: JURISDICTION });
const signed = signEnvelope(envFixture(), key.privKey);
const commitment = threadCommitment({ userId: USER_ID, saltT: SALT_T_HEX, threadId: THREAD_ID, jurisdiction: JURISDICTION });

console.log(JSON.stringify({
  contentHash: CONTENT_HASH,
  threadPubkey: key.threadPubkey,
  commitment,
  signature: signed.envelope.signature,
  txHash: signed.txHash,
}, null, 2));
