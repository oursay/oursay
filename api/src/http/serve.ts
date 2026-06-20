// Dev/prod entrypoint: connect the DB, apply schemas, build services + server, and listen.
// `npm run dev -w @oursay/api` runs this; Swagger UI is at /docs.

import { serverConfig } from "../config.js";
import { buildServices } from "../container.js";
import { Db } from "../db.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const db = new Db();
  await db.init();
  const services = await buildServices(db);
  const app = await buildServer(services, { logger: true });

  await app.listen({ port: serverConfig.port, host: serverConfig.host });
  app.log.info(`OurSay API listening on http://${serverConfig.host}:${serverConfig.port} (docs at /docs)`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start @oursay/api:", err);
  process.exit(1);
});
