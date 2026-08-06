import { expect } from "chai";
import { randomUUID } from "node:crypto";
import { p256 } from "@noble/curves/p256";
import { bytesToHex } from "@noble/hashes/utils";
import {
  buildAndSignPlatformOpsEnvelope,
  buildPlatformOpsAdminAttestationP256,
  buildPlatformOpsContent,
  buildPlatformOpsRequest,
  platformOpsEntityId,
} from "../src/identity/platform-ops.js";
import { platformPublicKey } from "../src/identity/platform-binding.js";
import { PublicChain } from "../src/ledger/chain.js";
import type { PgWireLedgerConnector } from "../src/ledger/pgwire.connector.js";
import type { PrivateStore } from "../src/private/store.js";
import { RecordService } from "../src/record.js";
import { getWorld, reclaimChains, rejects } from "./helpers/world.js";

describe("18 platform ops: appendPlatformOps", () => {
  const platformPriv = bytesToHex(p256.utils.randomPrivateKey());
  const adminPriv = bytesToHex(p256.utils.randomPrivateKey());
  const jurisdiction = "ab-ca-gov";

  let store: PrivateStore;
  let connector: PgWireLedgerConnector;
  let svc: RecordService;

  before(async () => {
    const w = await getWorld();
    store = w.store;
    await store.reset();
    await reclaimChains();
    const chainId = randomUUID();
    await w.ledger.createDatabaseFor(chainId);
    w.createdChainIds.push(chainId);
    connector = await w.ledger.getConnector(chainId);
    svc = new RecordService(new PublicChain(store, chainId, connector), store, {
      platformBindingPrivKeyHex: platformPriv,
      signedEnvelopeMaxAgeSec: 0,
    });
  });

  function seatPayload(handle: string, userId: string) {
    return { seatHandle: handle, userId };
  }

  it("appends a platform-signed seat claim with nested admin attestation", async () => {
    const request = buildPlatformOpsRequest({
      requestId: randomUUID(),
      kind: "official_seat_claim",
      jurisdictionId: jurisdiction,
      payload: seatPayload("ab-edm_strth", randomUUID()),
    });
    const attestation = buildPlatformOpsAdminAttestationP256({ request, privKeyHex: adminPriv });
    const content = buildPlatformOpsContent({ request, adminAttestation: attestation });
    const entityId = platformOpsEntityId(request.kind, request.payload);
    const signed = buildAndSignPlatformOpsEnvelope({
      platformPrivKeyHex: platformPriv,
      content,
      entityId,
      prevHash: null,
    });
    expect(signed.envelope.authorPubkey).to.equal(platformPublicKey(platformPriv));

    const ref = await svc.appendPlatformOps(signed);
    expect(ref.entityId).to.equal(entityId);
    expect(ref.txId).to.equal(signed.txId);

    const head = await store.getHeadTx(entityId);
    expect(head?.type).to.equal("platform_ops");
    expect(head?.authorPubkey).to.equal(platformPublicKey(platformPriv));
  });

  it("updates the same seat entity on revoke", async () => {
    const handle = "ab-test-seat-" + randomUUID().slice(0, 8);
    const claimReq = buildPlatformOpsRequest({
      requestId: randomUUID(),
      kind: "official_seat_claim",
      jurisdictionId: jurisdiction,
      payload: seatPayload(handle, randomUUID()),
    });
    const claimContent = buildPlatformOpsContent({
      request: claimReq,
      adminAttestation: buildPlatformOpsAdminAttestationP256({ request: claimReq, privKeyHex: adminPriv }),
    });
    const entityId = platformOpsEntityId(claimReq.kind, claimReq.payload);
    const claim = await svc.appendPlatformOps(
      buildAndSignPlatformOpsEnvelope({
        platformPrivKeyHex: platformPriv,
        content: claimContent,
        entityId,
        prevHash: null,
      }),
    );

    const revokeReq = buildPlatformOpsRequest({
      requestId: randomUUID(),
      kind: "official_seat_revoke",
      jurisdictionId: jurisdiction,
      payload: { seatHandle: handle },
    });
    const revokeContent = buildPlatformOpsContent({
      request: revokeReq,
      adminAttestation: buildPlatformOpsAdminAttestationP256({ request: revokeReq, privKeyHex: adminPriv }),
    });
    const head = await store.getHeadTx(entityId);
    const revoke = await svc.appendPlatformOps(
      buildAndSignPlatformOpsEnvelope({
        platformPrivKeyHex: platformPriv,
        content: revokeContent,
        entityId,
        prevHash: head!.txHash,
        op: "update",
      }),
    );
    expect(revoke.entityId).to.equal(claim.entityId);
    expect(revoke.txId).to.not.equal(claim.txId);
  });

  it("rejects a bad admin attestation", async () => {
    const request = buildPlatformOpsRequest({
      requestId: randomUUID(),
      kind: "official_seat_claim",
      jurisdictionId: jurisdiction,
      payload: seatPayload("bad-attest", randomUUID()),
    });
    const attestation = buildPlatformOpsAdminAttestationP256({ request, privKeyHex: adminPriv });
    attestation.signature = "00".repeat(64);
    const content = buildPlatformOpsContent({ request, adminAttestation: attestation });
    const signed = buildAndSignPlatformOpsEnvelope({
      platformPrivKeyHex: platformPriv,
      content,
      entityId: platformOpsEntityId(request.kind, request.payload),
      prevHash: null,
    });
    expect(await rejects(svc.appendPlatformOps(signed))).to.equal(true);
  });
});
