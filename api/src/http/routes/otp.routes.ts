// OTP request route. Registration codes go out directly; recovery codes are routed through
// RecoveryService so they only send for existing accounts (no enumeration). Always replies 202.

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";
import { errorSchema } from "../schemas.js";

export function registerOtpRoutes(app: FastifyInstance, services: Services): void {
  app.post(
    "/v1/auth/otp/request",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        summary: "Request an email one-time code (registration or recovery)",
        body: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            purpose: { type: "string", enum: ["registration", "recovery"], default: "registration" },
          },
          required: ["email"],
          additionalProperties: false,
        },
        response: {
          202: {
            type: "object",
            properties: { status: { type: "string" } },
            required: ["status"],
          },
          400: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const { email, purpose = "registration" } = req.body as { email: string; purpose?: "registration" | "recovery" };
      if (purpose === "recovery") {
        await services.recoveryService.requestRecovery({ emailRaw: email, ip: req.ip });
      } else {
        await services.otpService.request({ emailRaw: email, purpose: "registration", ip: req.ip });
      }
      reply.status(202).send({ status: "sent" });
    },
  );
}
