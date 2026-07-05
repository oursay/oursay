// Liveness/readiness. /healthz checks the DB round-trips so a deploy probe catches a bad connection.

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";

export function registerHealthRoutes(app: FastifyInstance, services: Services): void {
  app.get(
    "/healthz",
    {
      schema: {
        tags: ["meta"],
        summary: "Health check",
        response: {
          200: { type: "object", properties: { status: { type: "string" }, db: { type: "string" } }, required: ["status"] },
          503: { type: "object", properties: { status: { type: "string" }, db: { type: "string" } }, required: ["status"] },
        },
      },
    },
    async (_req, reply) => {
      let db = "ok";
      try {
        await services.db.pool.query("SELECT 1");
      } catch {
        db = "down";
        reply.status(503);
      }
      return { status: db === "ok" ? "ok" : "degraded", db };
    },
  );
}
