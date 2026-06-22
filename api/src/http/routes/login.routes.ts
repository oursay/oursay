// Gated cross-device login routes (docs/08). Email OTP is not a standing login method: a new device
// can only sign in after a TRUSTED device (full session + enrolled passkey) opens a login window.
//
//   POST /v1/auth/login/enable  — trusted device authorizes + sends a 'login' OTP to the account
//                                 email. The unified /v1/auth/otp/request {purpose:'login'} is the
//                                 (re)send path; it only fires while this window is open.
//   POST /v1/auth/login/verify  — new device redeems the code for a LIMITED 'login'-scoped session
//                                 (enroll a passkey, then log in with it for full access).

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";
import { setSessionCookie } from "../cookies.js";
import { bearerSecurity, errorSchema, otpSentResponseSchema, sessionSchema } from "../schemas.js";

export function registerLoginRoutes(app: FastifyInstance, services: Services): void {
  app.post(
    "/v1/auth/login/enable",
    {
      preHandler: app.requireFullScope,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["login"],
        summary: "Authorize cross-device login from a trusted device (sends a login OTP to the account email)",
        description:
          "Requires a full session AND at least one enrolled passkey. Opens a short-lived login " +
          "window (TTL = OTP_TTL_SEC) and emails a one-time code to sign in on another device.",
        security: bearerSecurity,
        response: { 202: otpSentResponseSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 429: errorSchema },
      },
    },
    async (req, reply) => {
      const result = await services.loginService.enable({ userId: req.user!.userId });
      reply.status(202).send({ status: "sent", expiresAt: result.expiresAt });
    },
  );

  app.post(
    "/v1/auth/login/verify",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags: ["login"],
        summary: "Complete cross-device login (login OTP → limited enroll-only session)",
        description:
          "Succeeds only if a login window was opened from a trusted device. Issues a 'login'-scoped " +
          "session that may enroll a passkey; full access comes from the subsequent passkey login.",
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
              status: { type: "string", enum: ["passkey_enroll"] },
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
      const result = await services.loginService.verifyLogin({
        emailRaw: email,
        code,
        userAgent: req.headers["user-agent"] ?? null,
      });
      setSessionCookie(reply, result.session.token, result.session.expiresAt);
      reply.status(200).send(result);
    },
  );
}
