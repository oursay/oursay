// Platform-ops HTTP: prepare (store clear request) + submit (admin attestation → platform envelope).
// Requires full session + platform admin role. Deep payload validation deferred.

import type { FastifyInstance } from "fastify";
import type { PlatformOpsAdminAttestation, PlatformOpsKind } from "@oursay/public-record";
import type { Services } from "../../container.js";
import { ServiceError } from "../../errors.js";
import { bearerSecurity, errorSchema } from "../schemas.js";

const KIND_ENUM = ["official_seat_claim", "official_seat_revoke"] as const;

const clearMessageSchema = {
  type: "object",
  properties: {
    ds: { type: "string" },
    v: { type: "number" },
    requestId: { type: "string" },
    kind: { type: "string", enum: KIND_ENUM },
    jurisdictionId: { type: "string" },
    payload: { type: "object", additionalProperties: true },
    createdAt: { type: "string" },
  },
  required: ["ds", "v", "requestId", "kind", "jurisdictionId", "payload", "createdAt"],
} as const;

const attestationSchema = {
  type: "object",
  properties: {
    signerPubkey: { type: "string" },
    signScheme: { type: "string", enum: ["p256", "webauthn-es256"] },
    signature: { type: "string" },
    webauthn: {
      type: "object",
      properties: {
        authenticatorData: { type: "string" },
        clientDataJSON: { type: "string" },
        signature: { type: "string" },
      },
      required: ["authenticatorData", "clientDataJSON", "signature"],
      additionalProperties: false,
    },
    signedAt: { type: "string" },
    requestHash: { type: "string" },
  },
  required: ["signerPubkey", "signScheme", "signature", "signedAt", "requestHash"],
  additionalProperties: false,
} as const;

export async function registerPlatformOpsRoutes(app: FastifyInstance, services: Services): Promise<void> {
  app.post(
    "/v1/platform-ops/prepare",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["platform-ops"],
        summary: "Prepare a platform-ops request (admin). Returns the clear message to attest.",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: {
            kind: { type: "string", enum: KIND_ENUM },
            jurisdictionId: { type: "string" },
            payload: { type: "object", additionalProperties: true },
          },
          required: ["kind", "jurisdictionId", "payload"],
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              requestId: { type: "string" },
              requestHash: { type: "string" },
              clearMessage: clearMessageSchema,
              expiresAt: { type: "string" },
            },
            required: ["requestId", "requestHash", "clearMessage", "expiresAt"],
          },
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (req) => {
      const body = req.body as {
        kind: PlatformOpsKind;
        jurisdictionId: string;
        payload: Record<string, unknown>;
      };
      return services.platformOpsService.prepare({
        preparedByUserId: req.user!.userId,
        kind: body.kind,
        jurisdictionId: body.jurisdictionId,
        payload: body.payload,
      });
    },
  );

  app.post(
    "/v1/platform-ops/submit",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["platform-ops"],
        summary: "Submit a prepared platform-ops request with an admin attestation.",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: {
            requestId: { type: "string" },
            adminAttestation: attestationSchema,
          },
          required: ["requestId", "adminAttestation"],
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              txId: { type: "string" },
              entityId: { type: "string" },
              txHash: { type: "string" },
              kind: { type: "string", enum: KIND_ENUM },
              jurisdictionId: { type: "string" },
            },
            required: ["txId", "entityId", "txHash", "kind", "jurisdictionId"],
          },
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req) => {
      const body = req.body as {
        requestId: string;
        adminAttestation: PlatformOpsAdminAttestation;
      };
      if (!body.adminAttestation?.signerPubkey) {
        throw new ServiceError("validation", "adminAttestation.signerPubkey is required");
      }
      return services.platformOpsService.submit({
        sessionUserId: req.user!.userId,
        requestId: body.requestId,
        adminAttestation: body.adminAttestation,
      });
    },
  );
}
