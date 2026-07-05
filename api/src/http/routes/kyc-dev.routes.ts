// Dev-only KYC attestation harness. Lets an AUTHENTICATED user (full session) self-attest to a KYC tier
// via the configured provider (the stub in dev/CI), so manual QA and tests can place a user at a tier
// without a raw INSERT into kyc_attestations. Registered ONLY when NODE_ENV !== "production" (see
// server.ts), mirroring the /walk guard. `hide: true` keeps it out of the committed OpenAPI spec (the
// dump runs in dev mode) — it is dev plumbing, not part of the API contract. No business logic here —
// it is a thin wrapper over KycService.

import type { FastifyInstance } from "fastify";
import { ServiceError } from "../../errors.js";
import type { Services } from "../../container.js";
import { KYC_TIERS, type KycTier } from "../../types/kyc.js";

export function registerKycDevRoutes(app: FastifyInstance, services: Services): void {
  app.post(
    "/v1/dev/kyc/attest",
    {
      preHandler: app.requireFullScope,
      schema: {
        hide: true,
        body: {
          type: "object",
          properties: {
            tier: { type: "string", enum: KYC_TIERS, description: "Tier to award (default residency_verified)." },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: { tier: { type: "string", enum: KYC_TIERS } },
            required: ["tier"],
          },
        },
      },
    },
    async (req) => {
      const tier = (req.body as { tier?: KycTier } | undefined)?.tier ?? "residency_verified";
      const result = await services.kycService.attest(req.user!.userId, tier);
      if (!result) throw new ServiceError("forbidden", "KYC provider declined the attestation");
      return result;
    },
  );
}
