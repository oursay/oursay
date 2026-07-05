// Session lifecycle: who-am-I + logout. Both require an active session (any scope).

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";
import { clearSessionCookie } from "../cookies.js";
import { bearerSecurity, errorSchema } from "../schemas.js";

export function registerAuthRoutes(app: FastifyInstance, services: Services): void {
  app.get(
    "/v1/auth/session",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["auth"],
        summary: "Describe the current session",
        security: bearerSecurity,
        response: {
          200: {
            type: "object",
            properties: { userId: { type: "string", format: "uuid" }, scope: { type: "string", enum: ["full", "recovery"] } },
            required: ["userId", "scope"],
          },
          401: errorSchema,
        },
      },
    },
    async (req) => ({ userId: req.user!.userId, scope: req.user!.scope }),
  );

  app.post(
    "/v1/auth/logout",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["auth"],
        summary: "Revoke the current session",
        security: bearerSecurity,
        response: { 204: { type: "null" }, 401: errorSchema },
      },
    },
    async (req, reply) => {
      await services.authService.revoke(req.user!.token);
      clearSessionCookie(reply);
      reply.status(204).send();
    },
  );
}
