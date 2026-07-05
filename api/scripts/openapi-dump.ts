// Write the served OpenAPI spec to api/openapi.yaml (committed, human-readable). The spec is derived
// from the route schemas, so this is just a snapshot for review/diffing — run after changing routes.
// No DB connection is needed: building the app only collects schemas.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../src/config.js";
import { buildServices } from "../src/container.js";
import { Db } from "../src/db.js";
import { buildServer } from "../src/http/server.js";

async function main(): Promise<void> {
  const db = new Db();
  const services = await buildServices(db);
  const app = await buildServer(services);

  const yaml = app.swagger({ yaml: true }) as unknown as string;
  const out = join(paths.packageRoot, "openapi.yaml");
  writeFileSync(out, yaml, "utf8");

  await app.close();
  await db.close();
  // eslint-disable-next-line no-console
  console.log(`Wrote ${out}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("openapi:dump failed:", err);
  process.exit(1);
});
