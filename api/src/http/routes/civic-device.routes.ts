// Civic device-key routes (docs/08 §5.4, Method 3). Authenticated (full session) enrollment, listing,
// and revocation of CIVIC signing device keys in public.device_keys. These are NOT account-login
// passkeys — they sign public-record actions. The platform stores the PUBLIC key only; the private
// key is generated and kept on the device. Multi-device: a user may enroll several civic keys.

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";
import { bearerSecurity, errorSchema } from "../schemas.js";

const civicDeviceSchema = {
  type: "object",
  properties: {
    devicePubkey: { type: "string", description: "SEC1 P-256 public key (hex). Public key only — never a private key." },
    label: { type: "string", nullable: true, description: "Optional human label, e.g. \"Alice's iPhone\"." },
    enrolledAt: { type: "string", format: "date-time" },
  },
  required: ["devicePubkey", "label", "enrolledAt"],
} as const;

export function registerCivicDeviceRoutes(app: FastifyInstance, services: Services): void {
  app.post(
    "/v1/civic/devices",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["civic"],
        summary: "Enrol a civic signing device key (public key only)",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: {
            devicePubkey: { type: "string", minLength: 1 },
            label: { type: "string" },
          },
          required: ["devicePubkey"],
          additionalProperties: false,
        },
        response: { 201: civicDeviceSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 409: errorSchema },
      },
    },
    async (req, reply) => {
      const body = req.body as { devicePubkey: string; label?: string };
      const result = await services.civicDeviceService.enroll({
        userId: req.user!.userId,
        devicePubkey: body.devicePubkey,
        label: body.label ?? null,
      });
      reply.status(201).send(result);
    },
  );

  app.get(
    "/v1/civic/devices",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["civic"],
        summary: "List the caller's enrolled (non-revoked) civic device keys",
        security: bearerSecurity,
        response: {
          200: {
            type: "object",
            properties: { devices: { type: "array", items: civicDeviceSchema } },
            required: ["devices"],
          },
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (req) => {
      const devices = await services.civicDeviceService.list(req.user!.userId);
      return { devices };
    },
  );

  // The device key is carried in the body (it's a 130-char hex point — too long for a path param,
  // which find-my-way caps at 100 chars by default).
  app.post(
    "/v1/civic/devices/revoke",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["civic"],
        summary: "Revoke one of the caller's civic device keys (lost/retired device)",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: { devicePubkey: { type: "string", minLength: 1 } },
          required: ["devicePubkey"],
          additionalProperties: false,
        },
        response: { 204: { type: "null" }, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      const { devicePubkey } = req.body as { devicePubkey: string };
      await services.civicDeviceService.revoke({ userId: req.user!.userId, devicePubkey });
      reply.status(204).send();
    },
  );
}
