import { expect } from "chai";
import { randomUUID } from "node:crypto";
import { p256 } from "@noble/curves/nist";
import { bytesToHex } from "@noble/hashes/utils";
import {
  buildAndSignPlatformOpsEnvelope,
  buildPlatformOpsAdminAttestationP256,
  buildPlatformOpsContent,
  buildPlatformOpsRequest,
  platformOpsEntityId,
} from "../src/identity/platform-ops.js";
import { platformPublicKey } from "../src/identity/platform-binding.js";
import { canonicalJson, sha256Hex } from "../src/crypto/commitment.js";
import { PublicChain } from "../src/ledger/chain.js";
import type { PgWireLedgerConnector } from "../src/ledger/pgwire.connector.js";
import type { PrivateStore } from "../src/private/store.js";
import { RecordService } from "../src/record.js";
import { getWorld, reclaimChains, rejects } from "./helpers/world.js";

describe("18 platform ops: appendPlatformOps", () => {
  const platformPriv = bytesToHex(p256.utils.randomSecretKey());
  const adminPriv = bytesToHex(p256.utils.randomSecretKey());
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

  async function signedOperation(
    kind: import("../src/schema/types.js").PlatformOpsKind,
    payload: Record<string, unknown>,
    opts: { entityId?: string; prevHash?: string | null; jurisdictionId?: string } = {},
  ) {
    const operationJurisdiction = opts.jurisdictionId ?? jurisdiction;
    const request = buildPlatformOpsRequest({
      requestId: randomUUID(),
      kind,
      jurisdictionId: operationJurisdiction,
      payload,
    });
    const content = buildPlatformOpsContent({
      request,
      adminAttestation: buildPlatformOpsAdminAttestationP256({ request, privKeyHex: adminPriv }),
    });
    const entityId = opts.entityId ?? platformOpsEntityId(kind, operationJurisdiction, payload);
    return buildAndSignPlatformOpsEnvelope({
      platformPrivKeyHex: platformPriv,
      content,
      entityId,
      prevHash: opts.prevHash ?? null,
      op: opts.prevHash ? "update" : "create",
    });
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
    const entityId = platformOpsEntityId(request.kind, request.jurisdictionId, request.payload);
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
    const entityId = platformOpsEntityId(claimReq.kind, claimReq.jurisdictionId, claimReq.payload);
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
      entityId: platformOpsEntityId(request.kind, request.jurisdictionId, request.payload),
      prevHash: null,
    });
    expect(await rejects(svc.appendPlatformOps(signed))).to.equal(true);
  });

  it("creates and updates one jurisdiction config entity", async () => {
    const first = await signedOperation("jurisdiction_config_set", {
      config: { id: jurisdiction, level: "provincial", rules: { allowChange: false } },
    });
    const created = await svc.appendPlatformOps(first);
    const second = await signedOperation(
      "jurisdiction_config_set",
      { config: { id: jurisdiction, level: "provincial", rules: { allowChange: true } } },
      { prevHash: created.txHash },
    );
    const updated = await svc.appendPlatformOps(second);
    expect(updated.entityId).to.equal(created.entityId);
    expect((await store.getEntityHistory(created.entityId)).length).to.equal(2);
  });

  it("commits a replayable district and seat snapshot", async () => {
    const geometry = {
      type: "Polygon",
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    };
    const district = await signedOperation("district_upsert", {
      district: {
        id: "test-district-2026",
        jurisdictionId: jurisdiction,
        name: "Test District",
        districtSlug: "test-district",
        effectiveDate: "2026-01-01",
        boundaryYear: 2026,
        source: "test",
        sourceRef: "1",
        srid: 4326,
        geometryGeoJSON: geometry,
        geometrySha256: sha256Hex(canonicalJson(geometry)),
      },
    });
    await svc.appendPlatformOps(district);

    const seat = await signedOperation("official_seat_upsert", {
      seat: {
        id: "test-seat-2026",
        jurisdictionId: jurisdiction,
        seatKind: "district_mla",
        title: "District MLA",
        seatHandle: "ab-test-seat",
        districtSlug: "test-district",
        districtShortSlug: "test",
        leaderRole: null,
        effectiveDate: "2026-01-01",
        boundaryYear: 2026,
        role: "MLA · Test District",
        representativeName: "Test Representative",
        claimedUserHandle: null,
        source: "test",
      },
    });
    await svc.appendPlatformOps(seat);
    expect(await store.getHeadTx(district.envelope.entityId)).to.not.equal(undefined);
    expect(await store.getHeadTx(seat.envelope.entityId)).to.not.equal(undefined);
  });

  it("rejects an entity id that does not match the signed jurisdiction payload", async () => {
    const signed = await signedOperation(
      "jurisdiction_config_set",
      { config: { id: jurisdiction, level: "provincial", rules: {} } },
      { entityId: randomUUID() },
    );
    expect(await rejects(svc.appendPlatformOps(signed))).to.equal(true);
  });

  it("rolls back the record and outbox when its projection fails", async () => {
    const rollbackJurisdiction = `rollback-${randomUUID().slice(0, 8)}`;
    const signed = await signedOperation("jurisdiction_config_set", {
      config: { id: rollbackJurisdiction, level: "provincial", rules: {} },
    }, { jurisdictionId: rollbackJurisdiction });
    expect(
      await rejects(
        svc.appendPlatformOps({
          ...signed,
          project: async () => {
            throw new Error("projection failed");
          },
        }),
      ),
    ).to.equal(true);
    expect(await store.getHeadTx(signed.envelope.entityId)).to.equal(undefined);
    expect(await store.getTx(signed.txId)).to.equal(undefined);
  });

  it("serializes concurrent updates to one entity head", async () => {
    const handle = `concurrent-${randomUUID().slice(0, 8)}`;
    const initial = await svc.appendPlatformOps(
      await signedOperation("official_seat_claim", seatPayload(handle, randomUUID())),
    );
    const one = await signedOperation(
      "official_seat_revoke",
      { seatHandle: handle },
      { prevHash: initial.txHash },
    );
    const two = await signedOperation(
      "official_seat_revoke",
      { seatHandle: handle },
      { prevHash: initial.txHash },
    );
    const results = await Promise.allSettled([
      svc.appendPlatformOps(one),
      svc.appendPlatformOps(two),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).to.have.length(1);
    expect(results.filter((r) => r.status === "rejected")).to.have.length(1);
  });
});
