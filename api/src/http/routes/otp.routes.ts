// Unified OTP request route — the single send path for all three purposes (docs/08), discriminated
// by `purpose`:
//   registration → RegistrationService, which 409s if the email is already registered (so we don't
//                  burn a code that can't complete sign-up).
//   recovery     → RecoveryService, which only sends for existing accounts (no enumeration).
//   login        → LoginService, which only (re)sends while a login window is open (opened from a
//                  trusted device via /v1/auth/login/enable); otherwise a silent no-op.
// Always replies 202; `expiresAt` is present only when a code was actually issued.

import type { FastifyInstance } from "fastify";
import type { OtpRequestResult } from "../../services/otp.service.js";
import type { Services } from "../../container.js";
import { errorSchema, otpSentResponseSchema } from "../schemas.js";

type OtpPurpose = "registration" | "recovery" | "login";

function otpSentBody(result: OtpRequestResult | null): { status: "sent"; expiresAt?: string } {
  return result ? { status: "sent", expiresAt: result.expiresAt } : { status: "sent" };
}

export function registerOtpRoutes(app: FastifyInstance, services: Services): void {
  app.post(
    "/v1/auth/otp/request",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        summary: "Request an email one-time code (registration, recovery, or gated login)",
        body: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            purpose: { type: "string", enum: ["registration", "recovery", "login"], default: "registration" },
          },
          required: ["email"],
          additionalProperties: false,
        },
        response: {
          202: otpSentResponseSchema,
          400: errorSchema,
          409: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const { email, purpose = "registration" } = req.body as { email: string; purpose?: OtpPurpose };
      let result: OtpRequestResult | null;
      if (purpose === "recovery") {
        result = await services.recoveryService.requestRecovery({ emailRaw: email, ip: req.ip });
      } else if (purpose === "login") {
        result = await services.loginService.requestLoginOtp({ emailRaw: email, ip: req.ip });
      } else {
        result = await services.registrationService.requestOtp({ emailRaw: email, ip: req.ip });
      }
      reply.status(202).send(otpSentBody(result));
    },
  );
}
