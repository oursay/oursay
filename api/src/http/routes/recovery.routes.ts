// Recovery routes: email-OTP path to regain access on a new device / lost passkey. The recovery code
// is REQUESTED through the unified endpoint (POST /v1/auth/otp/request {purpose:'recovery'}); only
// the verify + verified-account biometric steps live here.
//
// Unverified: OTP → recovery-scoped session → passkey re-enroll.
// Verified: OTP → recovery_kyc session → Didit biometric → recovery-scoped session → passkey re-enroll.

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";
import { setSessionCookie } from "../cookies.js";
import { bearerSecurity, errorSchema, sessionSchema } from "../schemas.js";

export function registerRecoveryRoutes(app: FastifyInstance, services: Services): void {
  app.post(
    "/v1/auth/recovery/verify",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags: ["recovery"],
        summary:
          "Verify a recovery code (unverified → recovery session; verified → recovery_kyc biometric challenge)",
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
              status: { type: "string", enum: ["passkey_reenroll", "kyc_reverification_required"] },
              userId: { type: "string", format: "uuid" },
              session: sessionSchema,
            },
            required: ["status", "userId", "session"],
          },
          400: errorSchema,
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
      setSessionCookie(reply, result.session.token, result.session.expiresAt);
      reply.status(200).send(result);
    },
  );

  app.post(
    "/v1/auth/recovery/kyc/session",
    {
      preHandler: app.requireRecoveryKycScope,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["recovery"],
        summary: "Start Didit biometric recovery (verified accounts only; recovery_kyc scope)",
        security: bearerSecurity,
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
          403: errorSchema,
          501: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const result = await services.recoveryService.startRecoveryKyc(req.user!.userId);
      reply.status(201).send(result);
    },
  );

  app.get(
    "/v1/auth/recovery/kyc/session/:sessionId",
    {
      preHandler: app.requireRecoveryKycScope,
      schema: {
        tags: ["recovery"],
        summary: "Poll biometric recovery; on Approved issues a recovery-scoped passkey-reenroll session",
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
              passkeyReenroll: {
                type: "object",
                nullable: true,
                properties: {
                  userId: { type: "string", format: "uuid" },
                  session: sessionSchema,
                },
              },
            },
            required: ["status"],
          },
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          501: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const { sessionId } = req.params as { sessionId: string };
      const result = await services.recoveryService.pollRecoveryKyc(
        req.user!.userId,
        sessionId,
        req.headers["user-agent"] ?? null,
      );
      if (result.status === "approved" && "passkeyReenroll" in result) {
        setSessionCookie(reply, result.passkeyReenroll.session.token, result.passkeyReenroll.session.expiresAt);
      }
      return result;
    },
  );
}
