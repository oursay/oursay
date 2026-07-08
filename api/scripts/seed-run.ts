/**
 * Dev DB seed implementation — imported only after NODE_ENV guard in seed.ts.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ingestBoundaries, ingestOfficialSeats, oursayGlobalPlatformSeat, ShapefileSource, paths } from "@oursay/geo";
import { DEV_STRATHCONA_ADDRESS, SHOWCASE_BINDINGS, seedUuid } from "./seed-data/content.js";
import { defaultSeedRng, runSeedOrchestrator } from "./seed-orchestrator.js";
import { buildSeedWorld, clearPasskeyDir } from "./seed-helpers.js";

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

async function ensureGeoBoundaries(world: Awaited<ReturnType<typeof buildSeedWorld>>): Promise<void> {
  const { rows } = await world.db.pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM geo.districts`,
  );
  if (Number(rows[0]?.n ?? 0) > 0) {
    console.log("geo.districts already populated — skipping ingest");
    return;
  }
  console.log("Ingesting Alberta 2019 districts…");
  const result = await ingestBoundaries(world.services.geoStore, alberta2019Source());
  console.log(`  → ${result.count} districts`);
  const seatResult = await ingestOfficialSeats(
    world.services.geoStore,
    {
      jurisdictionId: "ab-ca-gov",
      effectiveDate: "2019-04-16",
      boundaryYear: 2019,
    },
    paths.repoRoot,
  );
  await ingestOfficialSeats(
    world.services.geoStore,
    {
      jurisdictionId: "oursay-global",
      effectiveDate: "2019-04-16",
      boundaryYear: 2019,
      extraSeats: [oursayGlobalPlatformSeat()],
    },
    paths.repoRoot,
  );
  console.log(`  → ${seatResult.count} official seats`);
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

  await ensureGeoBoundaries(world);

  const { people, posts, members } = await runSeedOrchestrator(world, defaultSeedRng);

  const feed = await world.app.inject({ method: "GET", url: "/v1/public/feed?limit=80" });
  const feedCount =
    feed.statusCode === 200 ? ((feed.json() as { items?: unknown[] }).items?.length ?? 0) : 0;

  const visibilityShowcase = people.filter((p) =>
    ["strathcona_local", "whyte_public", "centre_district", "global_public", "anon_voice"].includes(
      p.handle,
    ),
  );

  const manifest = {
    seededAt: new Date().toISOString(),
    userCount: people.length,
    postCount: posts.length,
    feedItemCount: feedCount,
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

  console.log("\n--- summary ---");
  console.log(`  users:  ${people.length}`);
  console.log(`  posts:  ${posts.length}`);
  console.log(`  feed:   ${feedCount} items (GET /v1/public/feed)`);
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
