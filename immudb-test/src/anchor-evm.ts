import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

/**
 * EVM anchoring: publish the bundle Merkle root on-chain via an `anchor(bytes32)`
 * call. Once mined, the root + timestamp are immutable and globally verifiable without
 * trusting OurSay or GitHub. Here we build the calldata and sign the transaction digest
 * OFFLINE (no broadcast), then recover the signer — proving the signature is valid.
 *
 * In production this signing is delegated to the Turnkey wallet (see ../turnkey-test):
 * Turnkey's `signRawPayload` with HASH_FUNCTION_NO_OP signs exactly this 32-byte digest
 * over the same secp256k1 curve, returning {r, s, v}. Here we use a local secp256k1 key
 * so the test is deterministic and needs no network/credentials.
 */

const strip0x = (h: string) => (h.startsWith("0x") ? h.slice(2) : h);

/** Ethereum address (0x + last 20 bytes of keccak256 of the uncompressed pubkey). */
export function addressFromPrivKey(privHex: string): string {
  const priv = hexToBytes(strip0x(privHex));
  const pub = secp256k1.getPublicKey(priv, false).slice(1); // drop 0x04 prefix
  return "0x" + bytesToHex(keccak_256(pub).slice(-20));
}

export function randomPrivKey(): string {
  return "0x" + bytesToHex(secp256k1.utils.randomPrivateKey());
}

/** calldata = selector("anchor(bytes32)") || 32-byte root. */
export function buildAnchorCalldata(merkleRootHex: string): string {
  const selector = keccak_256(new TextEncoder().encode("anchor(bytes32)")).slice(0, 4);
  const root = hexToBytes(strip0x(merkleRootHex).padStart(64, "0"));
  return "0x" + bytesToHex(selector) + bytesToHex(root);
}

export interface AnchorSignature {
  address: string;
  digestHex: string; // the 32-byte digest that was signed
  calldataHex: string;
  signature: { r: string; s: string; v: number };
}

/** Build the anchor calldata, hash it, and sign the digest (recoverable secp256k1). */
export function signAnchor(merkleRootHex: string, privHex: string): AnchorSignature {
  const priv = hexToBytes(strip0x(privHex));
  const calldataHex = buildAnchorCalldata(merkleRootHex);
  const digest = keccak_256(hexToBytes(strip0x(calldataHex)));
  const sig = secp256k1.sign(digest, priv); // RecoveredSignature (has .recovery)
  return {
    address: addressFromPrivKey(privHex),
    digestHex: "0x" + bytesToHex(digest),
    calldataHex,
    signature: {
      r: "0x" + sig.r.toString(16).padStart(64, "0"),
      s: "0x" + sig.s.toString(16).padStart(64, "0"),
      v: 27 + sig.recovery,
    },
  };
}

/** Recover the signer address from a digest + signature (what a verifier/contract does). */
export function recoverAnchorSigner(digestHex: string, sig: { r: string; s: string; v: number }): string {
  const recovery = sig.v - 27;
  const signature = secp256k1.Signature.fromCompact(
    strip0x(sig.r).padStart(64, "0") + strip0x(sig.s).padStart(64, "0"),
  ).addRecoveryBit(recovery);
  const pub = signature.recoverPublicKey(hexToBytes(strip0x(digestHex))).toRawBytes(false).slice(1);
  return "0x" + bytesToHex(keccak_256(pub).slice(-20));
}
