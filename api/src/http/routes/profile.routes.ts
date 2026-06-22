// Profile route: a user's own PII, returned only to themselves (full session). PII is never public.
// Public-facing name (handle / displayName) lives on public.users; legal name (first/last) is private.

import type { FastifyInstance } from "fastify";
import { ServiceError } from "../../errors.js";
import type { Services } from "../../container.js";
import { bearerSecurity, errorSchema } from "../schemas.js";

export function registerProfileRoutes(app: FastifyInstance, services: Services): void {
  app.get(
    "/v1/profile",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["profile"],
        summary: "Get the authenticated user's own profile (private PII)",
        security: bearerSecurity,
        response: {
          200: {
            type: "object",
            properties: {
              userId: { type: "string", format: "uuid" },
              handle: { type: ["string", "null"] },
              displayName: { type: ["string", "null"] },
              firstName: { type: ["string", "null"] },
              lastName: { type: ["string", "null"] },
              email: { type: "string" },
              birthdate: { type: "string" },
              address: {
                type: "object",
                properties: {
                  line1: { type: ["string", "null"] },
                  line2: { type: ["string", "null"] },
                  city: { type: ["string", "null"] },
                  province: { type: ["string", "null"] },
                  postalCode: { type: ["string", "null"] },
                  country: { type: "string" },
                  memo: { type: ["string", "null"] },
                },
              },
            },
            required: ["userId", "email", "birthdate"],
          },
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req) => {
      const userId = req.user!.userId;
      const [user, profile] = await Promise.all([
        services.repos.user.getById(userId),
        services.repos.profile.getByUserId(userId),
      ]);
      if (!profile) throw new ServiceError("not_found", "Profile not found");
      return {
        userId,
        handle: user?.handle ?? null,
        displayName: user?.displayName ?? null,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        birthdate: profile.birthdate,
        address: {
          line1: profile.line1,
          line2: profile.line2,
          city: profile.city,
          province: profile.province,
          postalCode: profile.postalCode,
          country: profile.country,
          memo: profile.memo,
        },
      };
    },
  );
}
