// Packaged accreditation-body ingest: fail-closed on unknown catalog ids; --add-bodies creates +
// applies recognizedAccreditationBodyIds via jurisdiction_config_set.

import { expect } from "chai";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { abCaGovAccreditationBodies, abCaGovRecognizedAccreditationBodyIds } from "@oursay/jurisdiction-data";
import { ensureOpsServiceAccount } from "../src/helpers/ops-account.js";
import { assertAccreditationBodyId } from "../src/repo/accreditation-body.repo.js";
import { ingestAccreditationBodiesForJurisdiction } from "../scripts/lib/accreditation-body-ingest.js";
import { resetWorld, type World } from "./helpers/world.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AB = "ab-ca-gov";
const GALLERY = abCaGovAccreditationBodies[0]!;

async function seedCatalog(w: World, nameOverrides: Record<string, string> = {}): Promise<void> {
  for (const body of abCaGovAccreditationBodies) {
    await w.services.repos.accreditationBody.create(
      body.id,
      nameOverrides[body.id] ?? body.name,
    );
  }
}

describe("48 accreditation-body ingest", () => {
  let w: World;

  beforeEach(async () => {
    w = await resetWorld();
  });

  it("assertAccreditationBodyId rejects typo-unsafe ids", () => {
    expect(() => assertAccreditationBodyId("CJA")).to.throw(/invalid accreditation body id/);
    expect(() => assertAccreditationBodyId("Ab-Leg")).to.throw(/invalid accreditation body id/);
    expect(assertAccreditationBodyId("ab-leg-gallery")).to.equal("ab-leg-gallery");
  });

  it("fails closed when packaged body is missing from catalog", async () => {
    const ops = await ensureOpsServiceAccount(w.services);
    try {
      await ingestAccreditationBodiesForJurisdiction(w.services, ops, {
        jurisdictionId: AB,
        addBodies: false,
        log: () => undefined,
      });
      expect.fail("expected ingest to abort");
    } catch (err) {
      expect(err).to.be.instanceOf(Error);
      expect((err as Error).message).to.match(/not in catalog/);
      expect((err as Error).message).to.match(/--add-bodies or --force/);
      expect((err as Error).message).to.include(GALLERY.id);
    }
    expect(await w.services.repos.accreditationBody.getById(GALLERY.id)).to.equal(null);
  });

  it("with addBodies creates catalog row and applies recognition; re-run is idempotent", async () => {
    const ops = await ensureOpsServiceAccount(w.services);
    const first = await ingestAccreditationBodiesForJurisdiction(w.services, ops, {
      jurisdictionId: AB,
      addBodies: true,
      log: () => undefined,
      auditLog: () => undefined,
    });
    expect(first.created).to.equal(abCaGovAccreditationBodies.length);
    const body = await w.services.repos.accreditationBody.getById(GALLERY.id);
    expect(body?.name).to.equal(GALLERY.name);
    expect(body?.status).to.equal("active");

    const projections = await w.services.repos.jurisdictionConfig.list();
    const ab = projections.find((p) => p.config.id === AB);
    expect(ab?.config.recognizedAccreditationBodyIds).to.deep.equal(
      abCaGovRecognizedAccreditationBodyIds,
    );

    const second = await ingestAccreditationBodiesForJurisdiction(w.services, ops, {
      jurisdictionId: AB,
      addBodies: true,
      log: () => undefined,
      auditLog: () => undefined,
    });
    expect(second.created).to.equal(0);
    expect(second.skipped).to.be.at.least(1);
  });

  it("without addBodies warns on name drift and keeps catalog name", async () => {
    await seedCatalog(w, { [GALLERY.id]: "Catalog Drift Name" });
    const ops = await ensureOpsServiceAccount(w.services);
    const result = await ingestAccreditationBodiesForJurisdiction(w.services, ops, {
      jurisdictionId: AB,
      addBodies: false,
      log: () => undefined,
      auditLog: () => undefined,
    });
    expect(result.warnings.some((msg) => /name drift/.test(msg))).to.equal(true);
    expect(result.renamed).to.equal(0);
    const body = await w.services.repos.accreditationBody.getById(GALLERY.id);
    expect(body?.name).to.equal("Catalog Drift Name");
  });

  it("activates retired bodies intended for recognition", async () => {
    await seedCatalog(w);
    await w.services.repos.accreditationBody.retire(GALLERY.id);
    const ops = await ensureOpsServiceAccount(w.services);
    const result = await ingestAccreditationBodiesForJurisdiction(w.services, ops, {
      jurisdictionId: AB,
      addBodies: false,
      log: () => undefined,
      auditLog: () => undefined,
    });
    expect(result.activated).to.equal(1);
    expect((await w.services.repos.accreditationBody.getById(GALLERY.id))?.status).to.equal(
      "active",
    );
  });

  it("admin-accreditation-body-ingest prints usage when invoked with no args", function () {
    const help = spawnSync(
      "npx",
      ["tsx", "scripts/admin-accreditation-body-ingest.ts"],
      { cwd: packageRoot, encoding: "utf8", shell: true, env: { ...process.env, NODE_ENV: "development" } },
    );
    expect(help.status).to.equal(2);
    expect(help.stderr + help.stdout).to.match(/usage: admin-accreditation-body-ingest/);
  });
});
