// Official seat claims — roster seat ↔ membership role via platform-ops (signed).

import { expect } from "chai";
import { ingestOfficialSeats, paths } from "@oursay/geo";
import { ServiceError } from "../src/errors.js";
import { ensureOpsServiceAccount } from "../src/helpers/ops-account.js";
import { makeAccount } from "./helpers/account.js";
import { resetWorld, type World } from "./helpers/world.js";

const AB = "ab-ca-gov";

async function ingestAbSeats(w: World): Promise<void> {
  await ingestOfficialSeats(
    w.services.geoStore,
    { jurisdictionId: AB, effectiveDate: "2019-04-16", boundaryYear: 2019 },
    paths.repoRoot,
  );
}

async function claimViaOps(w: World, userId: string, seatHandle: string) {
  const ops = await ensureOpsServiceAccount(w.services);
  const seat = await w.services.geoStore.getOfficialSeatByHandle(seatHandle);
  if (!seat) throw new Error(`seat missing: ${seatHandle}`);
  return w.services.platformOpsService.submitWithOpsSoftKey({
    opsUserId: ops.userId,
    kind: "official_seat_claim",
    jurisdictionId: seat.jurisdictionId,
    payload: { seatHandle, userId },
    opsPrivKeyHex: ops.privKeyHex,
  });
}

async function revokeViaOps(w: World, seatHandle: string, expectedUserId?: string) {
  const ops = await ensureOpsServiceAccount(w.services);
  const seat = await w.services.geoStore.getOfficialSeatByHandle(seatHandle);
  if (!seat) throw new Error(`seat missing: ${seatHandle}`);
  const payload: Record<string, unknown> = { seatHandle };
  if (expectedUserId) payload.expectedUserId = expectedUserId;
  return w.services.platformOpsService.submitWithOpsSoftKey({
    opsUserId: ops.userId,
    kind: "official_seat_revoke",
    jurisdictionId: seat.jurisdictionId,
    payload,
    opsPrivKeyHex: ops.privKeyHex,
  });
}

describe("36 official seat claim", () => {
  let w: World;

  beforeEach(async () => {
    w = await resetWorld();
    await ingestAbSeats(w);
  });

  it("claim via platform-ops links ab-edm_strth and assigns official role", async () => {
    const author = await makeAccount(w, {
      handle: "rae_nguyen",
      displayName: "Rae Nguyen",
    });
    await w.services.repos.profile.setVisibility(author.userId, "public");
    await w.services.repos.membership.add(author.userId, AB);

    const ref = await claimViaOps(w, author.userId, "ab-edm_strth");
    expect(ref.entityId).to.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(ref.kind).to.equal("official_seat_claim");

    const seat = await w.services.geoStore.getOfficialSeatByHandle("ab-edm_strth");
    expect(seat?.claimedUserHandle).to.equal("rae_nguyen");

    const membership = await w.services.repos.membership.get(author.userId, AB);
    expect(membership?.role).to.equal("official");
    expect(membership?.representedDistrictSlug).to.equal("edmonton-strathcona");

    const res = await w.app.inject({
      method: "GET",
      url: "/v1/public/profiles/rae_nguyen",
    });
    expect(res.statusCode).to.equal(200, res.body);
    const body = res.json() as { role: string; official: boolean };
    expect(body.official).to.equal(true);
    expect(body.role).to.equal("MLA · Edmonton-Strathcona");
  });

  it("rejects claiming a seat already held by another user", async () => {
    const first = await makeAccount(w, { handle: "rae_nguyen" });
    const second = await makeAccount(w, { handle: "other_mla" });
    await claimViaOps(w, first.userId, "ab-edm_strth");

    try {
      await claimViaOps(w, second.userId, "ab-edm_strth");
      expect.fail("expected conflict");
    } catch (e: unknown) {
      expect(e).to.be.instanceOf(ServiceError);
      expect((e as ServiceError).code).to.equal("conflict");
    }
  });

  it("revoke via platform-ops clears the claim and official role", async () => {
    const author = await makeAccount(w, { handle: "rae_nguyen" });
    await claimViaOps(w, author.userId, "ab-edm_strth");

    await revokeViaOps(w, "ab-edm_strth");

    const seat = await w.services.geoStore.getOfficialSeatByHandle("ab-edm_strth");
    expect(seat?.claimedUserHandle).to.equal(null);

    const membership = await w.services.repos.membership.get(author.userId, AB);
    expect(membership?.role).to.equal(null);
    expect(membership?.representedDistrictSlug).to.equal(null);
  });

  it("revoke refuses when expected user does not match claimant", async () => {
    const holder = await makeAccount(w, { handle: "rae_nguyen" });
    const other = await makeAccount(w, { handle: "other_mla" });
    await claimViaOps(w, holder.userId, "ab-edm_strth");

    try {
      await revokeViaOps(w, "ab-edm_strth", other.userId);
      expect.fail("expected conflict");
    } catch (e: unknown) {
      expect(e).to.be.instanceOf(ServiceError);
      expect((e as ServiceError).code).to.equal("conflict");
    }

    const seat = await w.services.geoStore.getOfficialSeatByHandle("ab-edm_strth");
    expect(seat?.claimedUserHandle).to.equal("rae_nguyen");
  });

  it("HTTP prepare/submit with ops soft-key attestation", async () => {
    const author = await makeAccount(w, { handle: "rae_nguyen" });
    const ops = await ensureOpsServiceAccount(w.services);
    const session = await w.services.authService.issue(ops.userId, "full", "test");

    const seat = await w.services.geoStore.getOfficialSeatByHandle("ab-edm_strth");
    expect(seat).to.not.equal(null);

    const prep = await w.app.inject({
      method: "POST",
      url: "/v1/platform-ops/prepare",
      headers: { authorization: `Bearer ${session.token}` },
      payload: {
        kind: "official_seat_claim",
        jurisdictionId: AB,
        payload: { seatHandle: "ab-edm_strth", userId: author.userId },
      },
    });
    expect(prep.statusCode).to.equal(200, prep.body);
    const prepBody = prep.json() as {
      requestId: string;
      clearMessage: import("@oursay/public-record").PlatformOpsRequest;
    };

    const { buildPlatformOpsAdminAttestationP256 } = await import("@oursay/public-record");
    const adminAttestation = buildPlatformOpsAdminAttestationP256({
      request: prepBody.clearMessage,
      privKeyHex: ops.privKeyHex,
    });

    const sub = await w.app.inject({
      method: "POST",
      url: "/v1/platform-ops/submit",
      headers: { authorization: `Bearer ${session.token}` },
      payload: { requestId: prepBody.requestId, adminAttestation },
    });
    expect(sub.statusCode).to.equal(200, sub.body);
    const claimed = await w.services.geoStore.getOfficialSeatByHandle("ab-edm_strth");
    expect(claimed?.claimedUserHandle).to.equal("rae_nguyen");
  });
});
