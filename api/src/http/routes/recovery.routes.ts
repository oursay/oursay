// Recovery routes: email-OTP path to regain access on a new device / lost passkey. The recovery code
// is REQUESTED through the unified endpoint (POST /v1/auth/otp/request {purpose:'recovery'}); only
// the verify step lives here. On verify, the branch depends on KYC status (resolved from
// public.kyc_attestations): unverified accounts get a limited recovery session to re-enroll a
// passkey; verified accounts hit the KYC-reverification policy stub (409).

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";
import { setSessionCookie } from "../cookies.js";
import { errorSchema, sessionSchema } from "../schemas.js";

export function registerRecoveryRoutes(app: FastifyInstance, services: Services): void {
  app.post(
    "/v1/auth/recovery/verify",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags: ["recovery"],
        summary: "Verify a recovery code (unverified → recovery session; verified → KYC re-verification required)",
        body: {
          type: "object",
          properties: { email: { type: "string", format: "email" }, code: { type: "string", minLength: 1 } },
          required: ["email", "code"],
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["passkey_reenroll"] },
              userId: { type: "string", format: "uuid" },
              session: sessionSchema,
            },
            required: ["status", "userId", "session"],
          },
          400: errorSchema,
          409: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const { email, code } = req.body as { email: string; code: string };
      const result = await services.recoveryService.verifyRecovery({
        emailRaw: email,
        code,
        userAgent: req.headers["user-agent"] ?? null,
      });
      // verifyRecovery throws kyc_reverification_required (→409) for verified accounts; success here
      // is always the passkey re-enroll branch.
      setSessionCookie(reply, result.session.token, result.session.expiresAt);
      reply.status(200).send(result);
    },
  );
}
