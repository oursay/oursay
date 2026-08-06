import { randomUUID } from "node:crypto";
import { expect } from "chai";
import { p256 } from "@noble/curves/nist";
import { bytesToHex } from "@noble/hashes/utils";
import { jurisdictions } from "@oursay/jurisdiction-data";
import {
  buildPlatformOpsAdminAttestationP256,
  canonicalJson,
  getJurisdiction,
  platformPublicKey,
  registerJurisdiction,
  sha256Hex,
} from "@oursay/public-record";
import { makeAccount } from "./helpers/account.js";
import { resetWorld, type World } from "./helpers/world.js";

async function makeAdminSigner(w: World, handle: string) {
  const account = await makeAccount(w, { handle });
  const privKeyHex = bytesToHex(p256.utils.randomSecretKey());
  await w.services.repos.platformRole.grant(account.userId, "admin", null);
  await w.services.repos.opsSigningKey.insert({
    id: randomUUID(),
    userId: account.userId,
    pubkeyHex: platformPublicKey(privKeyHex),
    label: "test",
  });
  return { userId: account.userId, privKeyHex };
}

describe("47 jurisdiction actions audit", () => {
  let w: World;

  beforeEach(async () => {
    w = await resetWorld();
  });

  afterEach(() => {
    for (const jurisdiction of jurisdictions) registerJurisdiction(jurisdiction);
  });

  it("lets a second admin modify a config and atomically links the projection", async () => {
    const firstAdmin = await makeAdminSigner(w, "audit_admin_one");
    const secondAdmin = await makeAdminSigner(w, "audit_admin_two");
    const base = {
      id: "ab-ca-gov",
      level: "provincial",
      label: "Alberta audit one",
      rules: { allowChange: false },
    };
    const first = await w.services.platformOpsService.submitWithOpsSoftKey({
      opsUserId: firstAdmin.userId,
      opsPrivKeyHex: firstAdmin.privKeyHex,
      kind: "jurisdiction_config_set",
      jurisdictionId: base.id,
      payload: { config: base },
    });
    const updated = { ...base, label: "Alberta audit two" };
    const second = await w.services.platformOpsService.submitWithOpsSoftKey({
      opsUserId: secondAdmin.userId,
      opsPrivKeyHex: secondAdmin.privKeyHex,
      kind: "jurisdiction_config_set",
      jurisdictionId: updated.id,
      payload: { config: updated },
    });

    expect(second.entityId).to.equal(first.entityId);
    expect(second.txId).to.not.equal(first.txId);
    const [projection] = await w.services.repos.jurisdictionConfig.list();
    expect(projection?.sourceTxId).to.equal(second.txId);
    expect(projection?.sourceTxHash).to.equal(second.txHash);
    expect(projection?.config.label).to.equal("Alberta audit two");
    expect(getJurisdiction("ab-ca-gov").label).to.equal("Alberta audit two");
  });

  it("writes one replayable, audit-linked record per district and official seat", async () => {
    const admin = await makeAdminSigner(w, "audit_geo_admin");
    const geometry = {
      type: "Polygon",
      coordinates: [[[-114, 53], [-113, 53], [-113, 54], [-114, 53]]],
    };
    const district = {
      id: "audit-district-2026",
      jurisdictionId: "ab-ca-gov",
      name: "Audit District",
      districtSlug: "audit-district",
      effectiveDate: "2026-01-01",
      drawnDate: null,
      boundaryYear: 2026,
      source: "audit fixture",
      sourceRef: "AD-1",
      srid: 4326,
      geometryGeoJSON: geometry,
      geometrySha256: sha256Hex(canonicalJson(geometry)),
    };
    const districtRef = await w.services.platformOpsService.submitWithOpsSoftKey({
      opsUserId: admin.userId,
      opsPrivKeyHex: admin.privKeyHex,
      kind: "district_upsert",
      jurisdictionId: district.jurisdictionId,
      payload: { district },
    });
    const seat = {
      id: "audit-seat-2026",
      jurisdictionId: "ab-ca-gov",
      seatKind: "district_mla" as const,
      title: "District MLA",
      seatHandle: "ab-audit-seat",
      districtSlug: district.districtSlug,
      districtShortSlug: "audit",
      leaderRole: null,
      effectiveDate: "2026-01-01",
      boundaryYear: 2026,
      role: "MLA · Audit District",
      representativeName: "Audit Representative",
      claimedUserHandle: null,
      source: "audit fixture",
    };
    const seatRef = await w.services.platformOpsService.submitWithOpsSoftKey({
      opsUserId: admin.userId,
      opsPrivKeyHex: admin.privKeyHex,
      kind: "official_seat_upsert",
      jurisdictionId: seat.jurisdictionId,
      payload: { seat },
    });

    const districtRow = await w.db.pool.query(
      `SELECT source_entity_id, source_tx_id, source_tx_hash, geometry_sha256
         FROM geo.districts WHERE id = $1`,
      [district.id],
    );
    expect(String(districtRow.rows[0]?.source_entity_id)).to.equal(districtRef.entityId);
    expect(String(districtRow.rows[0]?.source_tx_id)).to.equal(districtRef.txId);
    expect(districtRow.rows[0]?.source_tx_hash).to.equal(districtRef.txHash);
    expect(districtRow.rows[0]?.geometry_sha256).to.equal(district.geometrySha256);

    const seatRow = await w.db.pool.query(
      `SELECT source_entity_id, source_tx_id, source_tx_hash
         FROM geo.official_seats WHERE id = $1`,
      [seat.id],
    );
    expect(String(seatRow.rows[0]?.source_entity_id)).to.equal(seatRef.entityId);
    expect(String(seatRow.rows[0]?.source_tx_id)).to.equal(seatRef.txId);
    expect(seatRow.rows[0]?.source_tx_hash).to.equal(seatRef.txHash);
  });

  it("skips unchanged snapshots and appends changed snapshots", async () => {
    const admin = await makeAdminSigner(w, "audit_idempotent_admin");
    const input = {
      opsUserId: admin.userId,
      opsPrivKeyHex: admin.privKeyHex,
      kind: "jurisdiction_config_set" as const,
      jurisdictionId: "oursay-global",
      payload: {
        config: {
          id: "oursay-global",
          level: "federal",
          label: "Idempotent",
          rules: {},
        },
      },
    };
    expect((await w.services.platformOpsService.submitWithOpsSoftKeyIfChanged(input)).changed).to.equal(true);
    expect((await w.services.platformOpsService.submitWithOpsSoftKeyIfChanged(input)).changed).to.equal(false);
    input.payload.config.label = "Changed";
    expect((await w.services.platformOpsService.submitWithOpsSoftKeyIfChanged(input)).changed).to.equal(true);
  });

  it("accepts the new kind over HTTP and exposes it to the explorer", async () => {
    const admin = await makeAdminSigner(w, "audit_http_admin");
    const session = await w.services.authService.issue(admin.userId, "full", "test");
    const prep = await w.app.inject({
      method: "POST",
      url: "/v1/platform-ops/prepare",
      headers: { authorization: `Bearer ${session.token}` },
      payload: {
        kind: "jurisdiction_config_set",
        jurisdictionId: "oursay-global",
        payload: {
          config: {
            id: "oursay-global",
            level: "federal",
            label: "HTTP audited",
            rules: {},
          },
        },
      },
    });
    expect(prep.statusCode).to.equal(200, prep.body);
    const prepared = prep.json() as {
      requestId: string;
      clearMessage: import("@oursay/public-record").PlatformOpsRequest;
    };
    const adminAttestation = buildPlatformOpsAdminAttestationP256({
      request: prepared.clearMessage,
      privKeyHex: admin.privKeyHex,
    });
    const submitted = await w.app.inject({
      method: "POST",
      url: "/v1/platform-ops/submit",
      headers: { authorization: `Bearer ${session.token}` },
      payload: { requestId: prepared.requestId, adminAttestation },
    });
    expect(submitted.statusCode).to.equal(200, submitted.body);
    const ref = submitted.json() as { txId: string };
    const explorer = await w.app.inject({
      method: "GET",
      url: `/v1/explorer/oursay-global/tx/${ref.txId}`,
    });
    expect(explorer.statusCode).to.equal(200, explorer.body);
    expect((explorer.json() as { type: string }).type).to.equal("platform_ops");
  });
});
