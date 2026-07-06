/**
 * Dev DB seed — ports the web-app mock corpus through the real civic write path.
 *
 * Run: `npm run seed -w @oursay/api` (after `npm run db:up -w @oursay/api`).
 * Re-run after api test suites — they share the dev DB on 5442 and truncate it.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ingestBoundaries, ShapefileSource, paths } from "@oursay/geo";
import { assertDestructiveAllowed } from "../../scripts/destructive-guard.js";
import { SEED_ROOTS } from "./seed-data/corpus.js";
import { SEED_PEOPLE } from "./seed-data/people.js";
import {
  buildSeedWorld,
  clearPasskeyDir,
  createSeedMember,
  seedRoot,
  type SeedMember,
} from "./seed-helpers.js";

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
}

async function main(): Promise<void> {
  assertDestructiveAllowed("api seed");
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
  console.log("Resetting dev DB…");
  await world.db.reset();

  await ensureGeoBoundaries(world);

  console.log(`Creating ${SEED_PEOPLE.length} accounts…`);
  const members = new Map<string, SeedMember>();
  for (const person of SEED_PEOPLE) {
    const m = await createSeedMember(world, person);
    members.set(person.handle, m);
    process.stdout.write(".");
  }
  console.log(" done");

  console.log(`Writing ${SEED_ROOTS.length} root records via civic SDK…`);
  for (const root of SEED_ROOTS) {
    await seedRoot(members, root);
    process.stdout.write(".");
  }
  console.log(" done");

  const feed = await world.app.inject({ method: "GET", url: "/v1/public/feed?limit=50" });
  const feedCount =
    feed.statusCode === 200 ? ((feed.json() as { items?: unknown[] }).items?.length ?? 0) : 0;

  const manifest = {
    seededAt: new Date().toISOString(),
    users: SEED_PEOPLE.map((p) => p.handle),
    roots: SEED_ROOTS.map((r) => ({ slug: r.slug, id: r.id, kind: r.kind, author: r.author })),
    feedItemCount: feedCount,
    hint: "Log in as alex_morgan@seed.oursay.dev via OTP/passkey after creating a passkey, or use /walk harness.",
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log("\n--- summary ---");
  console.log(`  users:  ${SEED_PEOPLE.length}`);
  console.log(`  roots:  ${SEED_ROOTS.length}`);
  console.log(`  feed:   ${feedCount} items (GET /v1/public/feed)`);
  console.log(`  manifest: ${MANIFEST_PATH}`);
  console.log("\nSeed complete. Start api + web-app with NEXT_PUBLIC_MOCK_ONLY=0 for live corpus.\n");

  await world.db.close();
  await world.app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
