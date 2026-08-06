// WebAuthn passkey routes. Registration is authenticated (full OR recovery/login/registration
// session, so bootstrap flows can enroll). Full-session add-device requires a short-lived
// enrollment authorization minted after a fresh assertion of an existing account passkey.
// Login is passkey-only — no email/password — and issues a full session.

import type { FastifyInstance } from "fastify";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { Services } from "../../container.js";
import { ServiceError } from "../../errors.js";
import { setSessionCookie } from "../cookies.js";
import { bearerSecurity, errorSchema, sessionSchema, webauthnJson } from "../schemas.js";

// Public management view of an enrolled account-login passkey (no key material).
const passkeySchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid", description: "Stable id used to revoke this passkey." },
    label: { type: "string", nullable: true, description: "User label, or a server-resolved default when unset." },
    transports: { type: "string", nullable: true, description: "CSV of authenticator transports." },
    createdAt: { type: "string", format: "date-time" },
    lastUsedAt: { type: "string", format: "date-time", nullable: true },
  },
  required: ["id", "label", "transports", "createdAt", "lastUsedAt"],
} as const;

const enrollmentAuthorizationSchema = {
  type: "object",
  properties: {
    enrollmentAuthorization: {
      type: "string",
      description: "Opaque single-use grant; pass to register/options and register/verify.",
    },
    expiresAt: { type: "string", format: "date-time" },
  },
  required: ["enrollmentAuthorization", "expiresAt"],
} as const;

export function registerPasskeyRoutes(app: FastifyInstance, services: Services): void {
  // ── enrollment authorization (full session step-up) ───────────────────────
  app.post(
    "/v1/auth/passkey/enroll-auth/options",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["passkey"],
        summary: "Begin enrollment step-up (returns WebAuthn assertion options for an existing passkey)",
        security: bearerSecurity,
        response: { 200: webauthnJson, 401: errorSchema, 403: errorSchema },
      },
    },
    async (req) => {
      return services.passkeyService.enrollAuthOptions(req.user!.userId);
    },
  );

  app.post(
    "/v1/auth/passkey/enroll-auth/verify",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["passkey"],
        summary: "Complete enrollment step-up (fresh assertion → short-lived enrollment authorization)",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: { response: webauthnJson },
          required: ["response"],
          additionalProperties: false,
        },
        response: {
          200: enrollmentAuthorizationSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (req) => {
      const body = req.body as { response: AuthenticationResponseJSON };
      return services.passkeyService.enrollAuthVerify({
        userId: req.user!.userId,
        response: body.response,
      });
    },
  );

  // ── registration (authenticated) ─────────────────────────────────────────
  app.post(
    "/v1/auth/passkey/register/options",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["passkey"],
        summary: "Begin passkey enrollment (returns WebAuthn creation options)",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: {
            enrollmentAuthorization: {
              type: "string",
              description: "Required for full-session add-device; omit for bootstrap scopes.",
            },
          },
          additionalProperties: false,
        },
        response: { 200: webauthnJson, 401: errorSchema, 403: errorSchema },
      },
    },
    async (req) => {
      const userId = req.user!.userId;
      if (req.user!.scope === "recovery_kyc") {
        throw new ServiceError(
          "forbidden",
          "Complete biometric recovery before enrolling a passkey",
        );
      }
      const body = (req.body ?? {}) as { enrollmentAuthorization?: string };
      const [user, profile] = await Promise.all([
        services.repos.user.getById(userId),
        services.repos.profile.getByUserId(userId),
      ]);
      return services.passkeyService.registerOptions({
        userId,
        userName: profile?.email ?? user?.handle ?? userId,
        userDisplayName: user?.displayName ?? user?.handle ?? "OurSay user",
        scope: req.user!.scope,
        enrollmentAuthorization: body.enrollmentAuthorization ?? null,
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
          properties: {
            response: webauthnJson,
            label: { type: "string" },
            enrollmentAuthorization: {
              type: "string",
              description: "Required for full-session add-device; omit for bootstrap scopes.",
            },
          },
          required: ["response"],
          additionalProperties: false,
        },
        response: {
          201: { type: "object", properties: { credentialId: { type: "string" } }, required: ["credentialId"] },
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (req, reply) => {
      if (req.user!.scope === "recovery_kyc") {
        throw new ServiceError(
          "forbidden",
          "Complete biometric recovery before enrolling a passkey",
        );
      }
      const body = req.body as {
        response: RegistrationResponseJSON;
        label?: string;
        enrollmentAuthorization?: string;
      };
      const result = await services.passkeyService.registerVerify({
        userId: req.user!.userId,
        response: body.response,
        label: body.label ?? null,
        scope: req.user!.scope,
        enrollmentAuthorization: body.enrollmentAuthorization ?? null,
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

  app.patch(
    "/v1/auth/passkey/label",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["passkey"],
        summary: "Rename one of the caller's passkeys",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            label: { type: "string", nullable: true },
          },
          required: ["id", "label"],
          additionalProperties: false,
        },
        response: {
          200: { type: "object", properties: { passkey: passkeySchema }, required: ["passkey"] },
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req) => {
      const { id, label } = req.body as { id: string; label: string | null };
      const passkey = await services.passkeyService.updateLabel({
        userId: req.user!.userId,
        id,
        label,
      });
      return { passkey };
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
        response: {
          204: { type: "null" },
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const { id } = req.body as { id: string };
      const session = await services.authService.resolve(req.user!.token);
      await services.passkeyService.revoke({
        userId: req.user!.userId,
        id,
        sessionCredentialId: session?.credentialId ?? null,
      });
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
