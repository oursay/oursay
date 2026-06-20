// Registration completion: verify the email OTP + profile body in one call, then create the account
// and issue a full session. The age gate (18+) lives in RegistrationService, not here.

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";
import { setSessionCookie } from "../cookies.js";
import { errorSchema, profileInputSchema, sessionSchema } from "../schemas.js";

export function registerRegistrationRoutes(app: FastifyInstance, services: Services): void {
  app.post(
    "/v1/auth/otp/verify",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        summary: "Verify a registration code with a profile body to create the account",
        body: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            code: { type: "string", minLength: 1 },
            profile: profileInputSchema,
          },
          required: ["email", "code", "profile"],
          additionalProperties: false,
        },
        response: {
          201: {
            type: "object",
            properties: { userId: { type: "string", format: "uuid" }, session: sessionSchema },
            required: ["userId", "session"],
          },
          400: errorSchema,
          403: errorSchema,
          409: errorSchema,
          429: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const body = req.body as {
        email: string;
        code: string;
        profile: { displayName: string; birthdate: string; address?: Record<string, string> };
      };
      const result = await services.registrationService.registerWithOtp({
        emailRaw: body.email,
        code: body.code,
        profile: body.profile,
        userAgent: req.headers["user-agent"] ?? null,
      });
      setSessionCookie(reply, result.session.token, result.session.expiresAt);
      reply.status(201).send(result);
    },
  );
}
