#!/usr/bin/env node
/**
 * Pull Alberta MLA roster from Open North Represent API and write working files under
 * ab-ca-gov/leaders/opennorth/. Run manually when the roster changes — ingestion and
 * official profiles read the normalized file, not the live API.
 *
 *   npm run pull:leaders -w @oursay/jurisdiction-data
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  districtSeatHandle,
  districtShortSlug,
  districtSlug,
  jurisdictionLeaderSeatHandle,
} from "./slugs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "ab-ca-gov", "leaders", "opennorth");
const RAW_DIR = path.join(OUT_DIR, "raw");
const NORMALIZED_PATH = path.join(OUT_DIR, "normalized", "seats.json");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");
const JUR_LEADER_PATH = path.join(ROOT, "ab-ca-gov", "leaders", "jurisdiction-leader.json");

const JURISDICTION_ID = "ab-ca-gov";
const JURISDICTION_SHORT = "ab";
const JURISDICTION_LABEL = "Alberta";
const ENDPOINT =
  "https://represent.opennorth.ca/representatives/alberta-legislature/";

function isPremier(rep) {
  const roles = rep.extra?.roles ?? [];
  return roles.some((role) => /^premier of alberta$/i.test(String(role).trim()));
}

function roleLineForMla(districtName) {
  return `MLA · ${districtName}`;
}

async function fetchAllRepresentatives() {
  const objects = [];
  let url = `${ENDPOINT}?limit=100`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open North fetch failed (${res.status}): ${url}`);
    }
    const body = await res.json();
    objects.push(...(body.objects ?? []));
    const next = body.meta?.next;
    url = next ? `https://represent.opennorth.ca${next}` : null;
  }
  return objects;
}

function buildCatalog(representatives) {
  const pulledAt = new Date().toISOString();
  const premier = representatives.find(isPremier) ?? null;
  const seats = [];

  for (const rep of representatives) {
    const slug = districtSlug(rep.district_name);
    const short = districtShortSlug(slug);
    seats.push({
      seatHandle: districtSeatHandle(JURISDICTION_SHORT, slug),
      seatKind: "district_mla",
      jurisdictionId: JURISDICTION_ID,
      jurisdictionShortSlug: JURISDICTION_SHORT,
      title: "District MLA",
      name: rep.name,
      role: roleLineForMla(rep.district_name),
      districtSlug: slug,
      districtShortSlug: short,
      partyName: rep.party_name || undefined,
      source: "opennorth",
      claimedUserHandle: null,
    });
  }

  if (premier) {
    const premierDistrictSlug = districtSlug(premier.district_name);
    seats.unshift({
      seatHandle: jurisdictionLeaderSeatHandle(JURISDICTION_SHORT, "premier"),
      seatKind: "jurisdiction_leader",
      jurisdictionId: JURISDICTION_ID,
      jurisdictionShortSlug: JURISDICTION_SHORT,
      title: "Alberta Premier",
      name: premier.name,
      role: `Premier · ${JURISDICTION_LABEL}`,
      leaderRole: "premier",
      districtSlug: premierDistrictSlug,
      districtShortSlug: districtShortSlug(premierDistrictSlug),
      partyName: premier.party_name || undefined,
      source: "opennorth",
      claimedUserHandle: null,
    });
  }

  seats.sort((a, b) => a.seatHandle.localeCompare(b.seatHandle));

  return {
    version: 1,
    jurisdictionId: JURISDICTION_ID,
    jurisdictionShortSlug: JURISDICTION_SHORT,
    pulledAt,
    source: "opennorth",
    sourceEndpoint: ENDPOINT,
    seats,
    premierName: premier?.name ?? null,
  };
}

async function main() {
  const representatives = await fetchAllRepresentatives();
  if (representatives.length === 0) {
    throw new Error("Open North returned no representatives");
  }

  const catalog = buildCatalog(representatives);
  const dateStamp = catalog.pulledAt.slice(0, 10);

  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(path.dirname(NORMALIZED_PATH), { recursive: true });

  await writeFile(
    path.join(RAW_DIR, `${dateStamp}.json`),
    JSON.stringify({ meta: { pulledAt: catalog.pulledAt, count: representatives.length }, objects: representatives }, null, 2),
    "utf8",
  );

  const { premierName, ...catalogOut } = catalog;
  await writeFile(NORMALIZED_PATH, JSON.stringify(catalogOut, null, 2), "utf8");

  await writeFile(
    MANIFEST_PATH,
    JSON.stringify(
      {
        jurisdictionId: JURISDICTION_ID,
        source: "opennorth",
        sourceEndpoint: ENDPOINT,
        lastPulledAt: catalog.pulledAt,
        rawSnapshot: `raw/${dateStamp}.json`,
        normalized: "normalized/seats.json",
        seatCount: catalog.seats.length,
        mlaCount: representatives.length,
        premierName,
      },
      null,
      2,
    ),
    "utf8",
  );

  if (premierName) {
    await mkdir(path.dirname(JUR_LEADER_PATH), { recursive: true });
    await writeFile(
      JUR_LEADER_PATH,
      JSON.stringify(
        {
          name: premierName,
          handle: jurisdictionLeaderSeatHandle(JURISDICTION_SHORT, "premier"),
          role: "premier",
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  console.log(
    `Pulled ${representatives.length} MLAs + ${premierName ? "1 premier" : "0 premier"} → ${path.relative(ROOT, NORMALIZED_PATH)} (${catalog.seats.length} seats)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
