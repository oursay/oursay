// KYC routes — Didit hosted sessions + platform residency self-attest. Registered in all environments.

import type { FastifyInstance } from "fastify";
import { ServiceError } from "../../errors.js";
import type { Services } from "../../container.js";
import { jurisdictionConfig } from "../../config.js";
import { bearerSecurity, errorSchema } from "../schemas.js";

export async function registerKycRoutes(app: FastifyInstance, services: Services): Promise<void> {
  app.post(
    "/v1/kyc/didit/session",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["kyc"],
        summary: "Start a Didit hosted identity or POA verification session",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: {
            workflowKind: { type: "string", enum: ["identity", "poa"], default: "identity" },
          },
          additionalProperties: false,
        },
        response: {
          201: {
            type: "object",
            properties: {
              sessionId: { type: "string" },
              url: { type: "string" },
            },
            required: ["sessionId", "url"],
          },
          401: errorSchema,
          501: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const { workflowKind = "identity" } = (req.body ?? {}) as { workflowKind?: "identity" | "poa" };
      const result = await services.kycSessionService.startDiditSession(req.user!.userId, workflowKind);
      reply.status(201).send(result);
    },
  );

  app.get(
    "/v1/kyc/didit/session/:sessionId",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["kyc"],
        summary: "Poll a Didit session owned by the caller (throttled vendor fetch)",
        security: bearerSecurity,
        params: {
          type: "object",
          properties: { sessionId: { type: "string" } },
          required: ["sessionId"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              tier: { type: "string", nullable: true },
            },
            required: ["status"],
          },
          401: errorSchema,
          404: errorSchema,
          501: errorSchema,
        },
      },
    },
    async (req) => {
      const { sessionId } = req.params as { sessionId: string };
      return services.kycSessionService.getDiditSessionStatus(req.user!.userId, sessionId);
    },
  );

  await app.register(async (webhookApp) => {
    webhookApp.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });

    // Didit (and ngrok) URL checks — POST is the real webhook; GET confirms reachability.
    webhookApp.get(
      "/v1/kyc/didit/webhook",
      {
        schema: {
          tags: ["kyc"],
          hide: true,
          summary: "Didit webhook reachability probe",
          response: {
            200: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                endpoint: { type: "string" },
                method: { type: "string" },
              },
            },
          },
        },
      },
      async () => ({ ok: true, endpoint: "didit-kyc-webhook", method: "POST" }),
    );

    webhookApp.post(
      "/v1/kyc/didit/webhook",
      {
        schema: {
          tags: ["kyc"],
          hide: true,
          summary: "Didit verification webhook (raw-body HMAC)",
          response: { 200: { type: "object", properties: { received: { type: "boolean" } } }, 401: errorSchema, 501: errorSchema },
        },
      },
      async (req, reply) => {
        const rawBody = (req.body as Buffer).toString("utf8");
        const headers: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
        }
        try {
          await services.kycSessionService.handleDiditWebhook(rawBody, headers);
        } catch (e) {
          if (e instanceof ServiceError && e.code === "unauthorized") {
            reply.status(401).send({ error: { code: e.code, message: e.message } });
            return;
          }
          if (e instanceof ServiceError && e.code === "not_implemented") {
            reply.status(501).send({ error: { code: e.code, message: e.message } });
            return;
          }
          throw e;
        }
        reply.status(200).send({ received: true });
      },
    );
  });

  app.post(
    "/v1/kyc/residency/attest",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["kyc"],
        summary: "Platform self-attest residency when the caller's geocoded point is inside a jurisdiction",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: {
            consent: { type: "boolean" },
            jurisdictionId: { type: "string" },
          },
          required: ["consent"],
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: { tier: { type: "string" } },
            required: ["tier"],
          },
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (req) => {
      const body = req.body as { consent: boolean; jurisdictionId?: string };
      if (!body.consent) throw new ServiceError("validation", "consent must be true");
      const jurisdictionId = body.jurisdictionId ?? jurisdictionConfig.id;
      return services.kycSessionService.attestPlatformResidency(req.user!.userId, jurisdictionId);
    },
  );
}
