// Dev-only official-role harness. Lets an AUTHENTICATED user (full session) self-assign or revoke the
// platform official role for manual QA — paired with POST /v1/dev/kyc/attest on the Validate ID cycle.
// Registered ONLY when NODE_ENV !== "production" (see server.ts). `hide: true` keeps it out of the
// committed OpenAPI spec.

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";

const DEFAULT_JURISDICTION = "ab-ca-gov";
const DEFAULT_DISTRICT = "edmonton-strathcona";

export function registerMembershipDevRoutes(app: FastifyInstance, services: Services): void {
  app.post(
    "/v1/dev/official/role",
    {
      preHandler: app.requireFullScope,
      schema: {
        hide: true,
        body: {
          type: "object",
          properties: {
            assign: {
              type: "boolean",
              description: "true to award the official role; false to revoke it.",
            },
            jurisdictionId: { type: "string" },
            districtSlug: { type: "string" },
          },
          required: ["assign"],
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              official: { type: "boolean" },
              jurisdictionId: { type: "string" },
            },
            required: ["official", "jurisdictionId"],
          },
        },
      },
    },
    async (req) => {
      const body = req.body as {
        assign: boolean;
        jurisdictionId?: string;
        districtSlug?: string;
      };
      const jurisdictionId = body.jurisdictionId ?? DEFAULT_JURISDICTION;
      const userId = req.user!.userId;

      if (body.assign) {
        await services.repos.membership.setRole(
          userId,
          jurisdictionId,
          "official",
          body.districtSlug ?? DEFAULT_DISTRICT,
        );
        return { official: true, jurisdictionId };
      }

      await services.repos.membership.setRole(userId, jurisdictionId, null, null);
      return { official: false, jurisdictionId };
    },
  );
}
