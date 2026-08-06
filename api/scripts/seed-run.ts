/**
 * Dev DB seed implementation — imported only after NODE_ENV guard in seed.ts.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  materializeDistricts,
  materializeOfficialSeats,
  oursayGlobalPlatformSeat,
  ShapefileSource,
  paths,
} from "@oursay/geo";
import { jurisdictions } from "@oursay/jurisdiction-data";
import { canonicalJson, registerJurisdiction, sha256Hex } from "@oursay/public-record";
import { DEV_STRATHCONA_ADDRESS, SHOWCASE_BINDINGS, seedUuid } from "./seed-data/content.js";
import { SEED_ADMIN_HANDLE } from "./seed-data/people.js";
import { defaultSeedRng, runSeedOrchestrator } from "./seed-orchestrator.js";
import { buildSeedWorld, clearPasskeyDir } from "./seed-helpers.js";
import { ensureOpsServiceAccount } from "../src/helpers/ops-account.js";

process.env.OURSAY_DEV_PASSKEY = "1";

const DEV_DIR = join(process.cwd(), ".oursay-dev");
const MANIFEST_PATH = join(DEV_DIR, "seed-manifest.json");

function alberta2019Source(): ShapefileSource {
  const shpPath = join(
    paths.repoRoot,
    "jurisdiction-data",
    "ab-ca-gov",
    "districts",
    "ElectionsAlberta",
    "2019",
    "EDS_ENACTED_BILL33_15DEC2017.shp",
  );
  return new ShapefileSource({
    sourceId: "seed/ElectionsAlberta/EDS_ENACTED_BILL33_15DEC2017",
    jurisdictionId: "ab-ca-gov",
    effectiveDate: "2019-04-16",
    drawnDate: "2017-12-15",
    boundaryYear: 2019,
    srid: 3401,
    shpPath,
    fieldMap: { name: "EDName2017", ref: "EDNumber20" },
  });
}

async function ingestAuditedJurisdictionData(
  world: Awaited<ReturnType<typeof buildSeedWorld>>,
  ops: { userId: string; privKeyHex: string },
): Promise<void> {
  for (const config of jurisdictions) {
    await world.services.platformOpsService.submitWithOpsSoftKeyIfChanged({
      opsUserId: ops.userId,
      kind: "jurisdiction_config_set",
      jurisdictionId: config.id,
      payload: { config },
      opsPrivKeyHex: ops.privKeyHex,
    });
  }

  console.log("Ingesting Alberta 2019 districts…");
  const districts = await materializeDistricts(world.services.geoStore, alberta2019Source());
  for (const district of districts) {
    const geometrySha256 = sha256Hex(canonicalJson(district.geometryGeoJSON));
    await world.services.platformOpsService.submitWithOpsSoftKeyIfChanged({
      opsUserId: ops.userId,
      kind: "district_upsert",
      jurisdictionId: district.jurisdictionId,
      payload: { district: { ...district, geometrySha256 } },
      opsPrivKeyHex: ops.privKeyHex,
    });
  }
  console.log(`  → ${districts.length} districts`);

  const abSeats = await materializeOfficialSeats(
    {
      jurisdictionId: "ab-ca-gov",
      effectiveDate: "2019-04-16",
      boundaryYear: 2019,
    },
    paths.repoRoot,
  );
  const globalSeats = await materializeOfficialSeats(
    {
      jurisdictionId: "oursay-global",
      effectiveDate: "2019-04-16",
      boundaryYear: 2019,
      extraSeats: [oursayGlobalPlatformSeat()],
    },
    paths.repoRoot,
  );
  for (const seat of [...abSeats, ...globalSeats]) {
    await world.services.platformOpsService.submitWithOpsSoftKeyIfChanged({
      opsUserId: ops.userId,
      kind: "official_seat_upsert",
      jurisdictionId: seat.jurisdictionId,
      payload: { seat },
      opsPrivKeyHex: ops.privKeyHex,
    });
  }
  console.log(`  → ${abSeats.length + globalSeats.length} official seats`);
}

async function main(): Promise<void> {
  console.log("\n=== OurSay dev seed ===\n");

  if (existsSync(DEV_DIR)) {
    for (const sub of ["seed-passkeys"]) {
      const p = join(DEV_DIR, sub);
      if (existsSync(p)) rmSync(p, { recursive: true, force: true });
    }
  } else {
    mkdirSync(DEV_DIR, { recursive: true });
  }
  clearPasskeyDir();

  const world = await buildSeedWorld();
  // NOTE: the content seed is NOT idempotent — it fully wipes the civic record (db.reset) and the
  // dev passkey dir on every run, then re-seeds from scratch. "Re-seed" therefore means "reset +
  // rebuild", never "merge into existing data". (Geo boundary ingest below IS idempotent — it skips
  // when geo.districts is already populated.) db.reset() routes through assertDestructiveAllowed, so
  // it refuses to run under NODE_ENV=production.
  console.log("Resetting dev DB…");
  await world.db.reset();
  for (const jurisdiction of jurisdictions) registerJurisdiction(jurisdiction);

  console.log("Provisioning ops service account + soft-key…");
  const ops = await ensureOpsServiceAccount(world.services);
  console.log(" done");

  // The catalog row is mutable platform data outside this change's audit scope. Create it before
  // committing configs that recognize its stable id.
  const SEED_MEDIA_BODY = "ab-leg-gallery";
  try {
    await world.services.repos.accreditationBody.create(
      SEED_MEDIA_BODY,
      "Alberta Legislative Assembly Press Gallery",
    );
  } catch {
    // Idempotent re-seed: body may already exist.
  }

  await ingestAuditedJurisdictionData(world, ops);

  const { people, posts, members } = await runSeedOrchestrator(world, defaultSeedRng);

  const adminMember = members.get(SEED_ADMIN_HANDLE);
  if (!adminMember) {
    throw new Error(`seed admin handle missing from members: ${SEED_ADMIN_HANDLE}`);
  }
  const adminEmail = `${SEED_ADMIN_HANDLE}@seed.oursay.dev`;
  console.log(`Granting platform admin → ${adminEmail}…`);
  // Bootstrap grant: granted_by_admin_id stays NULL (same as CLI first admin).
  await world.services.repos.platformRole.grant(adminMember.userId, "admin", null);
  console.log(" done");

  // Media catalog + accreditation for local Media mark / AB recognition demos.
  const SEED_MEDIA_HANDLE = "global_public";
  console.log(`Seeding accreditation body ${SEED_MEDIA_BODY} + Media mark → ${SEED_MEDIA_HANDLE}…`);
  const mediaMember = members.get(SEED_MEDIA_HANDLE);
  if (mediaMember) {
    await world.services.repos.mediaAccreditation.grant({
      userId: mediaMember.userId,
      accreditationBodyId: SEED_MEDIA_BODY,
      grantedByAdminId: adminMember.userId,
    });
  }
  console.log(" done");

  const feed = await world.app.inject({ method: "GET", url: "/v1/public/feed?limit=80" });
  const feedCount =
    feed.statusCode === 200 ? ((feed.json() as { items?: unknown[] }).items?.length ?? 0) : 0;

  const visibilityShowcase = people.filter((p) =>
    ["strathcona_local", "whyte_public", "centre_district", "global_public", "anon_voice"].includes(
      p.handle,
    ),
  );

  const adminPosts = posts.filter((p) => p.authorHandle === SEED_ADMIN_HANDLE);

  const manifest = {
    seededAt: new Date().toISOString(),
    userCount: people.length,
    postCount: posts.length,
    feedItemCount: feedCount,
    platformAdmin: {
      handle: SEED_ADMIN_HANDLE,
      email: adminEmail,
      userId: adminMember.userId,
      postSlugs: adminPosts.map((p) => p.slug),
      note: "Bootstrap admin (platformRoles includes admin). Not an Official — Platform mark is orthogonal.",
    },
    visibilityShowcase: visibilityShowcase.map((p) => ({
      handle: p.handle,
      email: `${p.handle}@seed.oursay.dev`,
      visibility: p.visibility,
      districts: p.districts ?? [],
    })),
    devVerifyIntoStrathcona: {
      summary:
        "Patch your profile with this address, identity-verify, then POST /v1/kyc/residency/attest to see my_district commenters in Edmonton-Strathcona.",
      profilePatch: DEV_STRATHCONA_ADDRESS,
      steps: [
        "POST /v1/dev/kyc/attest { tier: \"identity_verified\" } (dev only)",
        "PATCH /v1/profile with devVerifyIntoStrathcona.profilePatch",
        "POST /v1/kyc/residency/attest { consent: true, jurisdictionId: \"ab-ca-gov\" }",
        "Open a post with comments by strathcona_local (my_district) vs whyte_public (public)",
      ],
    },
    samplePosts: posts
      .filter((p) => p.jurisdiction === "ab-ca-gov")
      .slice(0, 8)
      .map((p) => ({
        slug: p.slug,
        id: p.id,
        kind: p.kind,
        author: p.authorHandle,
        appliesToDistrictIds: p.appliesToDistrictIds,
      })),
    districtShowcase: SHOWCASE_BINDINGS.map((b) => ({
      slug: b.slug,
      author: b.author,
      id: seedUuid(b.slug),
    })),
    hint: "Log in via OTP at {handle}@seed.oursay.dev or use /walk. Set NEXT_PUBLIC_MOCK_ONLY=0 for live feed.",
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  const { rows: outboxRows } = await world.db.pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM record_outbox`,
  );
  const outboxCount = Number(outboxRows[0]?.n ?? 0);

  console.log("\n--- summary ---");
  console.log(`  users:  ${people.length}`);
  console.log(`  posts:  ${posts.length}`);
  console.log(`  outbox: ${outboxCount} tx (worker settles 250/block; ≥500 → 2 blocks → EVM)`);
  console.log(`  feed:   ${feedCount} items (GET /v1/public/feed)`);
  console.log(`  admin:  ${SEED_ADMIN_HANDLE} (${adminEmail}) — Platform mark on their posts/comments`);
  console.log(`  manifest: ${MANIFEST_PATH}`);
  console.log("\n  Visibility showcase:");
  for (const p of visibilityShowcase) {
    console.log(`    ${p.handle} (${p.visibility}) — ${p.handle}@seed.oursay.dev`);
  }
  console.log("\n  Dev-verify into Edmonton-Strathcona (see my_district commenters):");
  console.log(`    ${DEV_STRATHCONA_ADDRESS.line1}, ${DEV_STRATHCONA_ADDRESS.city} ${DEV_STRATHCONA_ADDRESS.province} ${DEV_STRATHCONA_ADDRESS.postalCode}`);
  console.log("\nSeed complete. Start api + web-app with NEXT_PUBLIC_MOCK_ONLY=0 for live corpus.\n");

  await world.db.close();
  await world.app.close();
  // Fastify/pg can leave open handles in some host setups; force exit after cleanup.
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
