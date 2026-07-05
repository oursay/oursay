// WebAuthn passkey routes. Registration is authenticated (full OR recovery session, so recovery can
// re-enroll). Login is passkey-only — no email/password — and issues a full session.

import type { FastifyInstance } from "fastify";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { Services } from "../../container.js";
import { setSessionCookie } from "../cookies.js";
import { bearerSecurity, errorSchema, sessionSchema, webauthnJson } from "../schemas.js";

// Public management view of an enrolled account-login passkey (no key material).
const passkeySchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid", description: "Stable id used to revoke this passkey." },
    label: { type: "string", nullable: true, description: "Optional human label, e.g. \"Alice's laptop\"." },
    transports: { type: "string", nullable: true, description: "CSV of authenticator transports." },
    createdAt: { type: "string", format: "date-time" },
    lastUsedAt: { type: "string", format: "date-time", nullable: true },
  },
  required: ["id", "label", "transports", "createdAt", "lastUsedAt"],
} as const;

export function registerPasskeyRoutes(app: FastifyInstance, services: Services): void {
  // ── registration (authenticated) ─────────────────────────────────────────
  app.post(
    "/v1/auth/passkey/register/options",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["passkey"],
        summary: "Begin passkey enrollment (returns WebAuthn creation options)",
        security: bearerSecurity,
        response: { 200: webauthnJson, 401: errorSchema },
      },
    },
    async (req) => {
      const userId = req.user!.userId;
      const [user, profile] = await Promise.all([
        services.repos.user.getById(userId),
        services.repos.profile.getByUserId(userId),
      ]);
      return services.passkeyService.registerOptions({
        userId,
        userName: profile?.email ?? user?.handle ?? userId,
        userDisplayName: user?.displayName ?? user?.handle ?? "OurSay user",
      });
    },
  );

  app.post(
    "/v1/auth/passkey/register/verify",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["passkey"],
        summary: "Complete passkey enrollment (store the credential)",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: { response: webauthnJson, label: { type: "string" } },
          required: ["response"],
          additionalProperties: false,
        },
        response: {
          201: { type: "object", properties: { credentialId: { type: "string" } }, required: ["credentialId"] },
          400: errorSchema,
          401: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const body = req.body as { response: RegistrationResponseJSON; label?: string };
      const result = await services.passkeyService.registerVerify({
        userId: req.user!.userId,
        response: body.response,
        label: body.label ?? null,
      });
      reply.status(201).send(result);
    },
  );

  // ── device management (authenticated, full session) ───────────────────────
  app.get(
    "/v1/auth/passkeys",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["passkey"],
        summary: "List the caller's enrolled account-login passkeys (devices)",
        security: bearerSecurity,
        response: {
          200: {
            type: "object",
            properties: { passkeys: { type: "array", items: passkeySchema } },
            required: ["passkeys"],
          },
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (req) => {
      const passkeys = await services.passkeyService.list(req.user!.userId);
      return { passkeys };
    },
  );

  app.post(
    "/v1/auth/passkey/revoke",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["passkey"],
        summary: "Remove one of the caller's passkeys (kick a compromised/retired device)",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
          additionalProperties: false,
        },
        response: { 204: { type: "null" }, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      const { id } = req.body as { id: string };
      await services.passkeyService.revoke({ userId: req.user!.userId, id });
      reply.status(204).send();
    },
  );

  // ── login (passkey-only) ───────────────────────────────────────────────────
  app.post(
    "/v1/auth/passkey/login/options",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["passkey"],
        summary: "Begin passkey login (returns WebAuthn request options)",
        body: {
          type: "object",
          properties: { email: { type: "string", format: "email" } },
          additionalProperties: false,
        },
        response: { 200: webauthnJson },
      },
    },
    async (req) => {
      const body = (req.body ?? {}) as { email?: string };
      return services.passkeyService.loginOptions({ emailRaw: body.email ?? null });
    },
  );

  app.post(
    "/v1/auth/passkey/login/verify",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["passkey"],
        summary: "Complete passkey login (assertion → session)",
        body: {
          type: "object",
          properties: { response: webauthnJson },
          required: ["response"],
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: { userId: { type: "string", format: "uuid" }, session: sessionSchema },
            required: ["userId", "session"],
          },
          400: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const body = req.body as { response: AuthenticationResponseJSON };
      const result = await services.passkeyService.loginVerify({
        response: body.response,
        userAgent: req.headers["user-agent"] ?? null,
      });
      setSessionCookie(reply, result.session.token, result.session.expiresAt);
      reply.status(200).send(result);
    },
  );
}
