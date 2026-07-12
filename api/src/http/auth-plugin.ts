// Session auth for HTTP: resolve an opaque token from the Authorization: Bearer header OR the session
// cookie into an active session, and attach it as request.user. Two preHandlers are exposed on the
// instance: `authenticate` (any active session) and `requireFullScope` (rejects the limited
// recovery/login scopes from full actions). Both delegate to AuthService — no session logic lives in HTTP.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sessionConfig } from "../config.js";
import { ServiceError } from "../errors.js";
import type { Services } from "../container.js";

export interface AuthUser {
  userId: string;
  scope: "full" | "recovery" | "login" | "registration" | "recovery_kyc";
  token: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireFullScope: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRecoveryKycScope: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuthenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function bearerOrCookie(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();
  const cookie = (req.cookies as Record<string, string | undefined> | undefined)?.[sessionConfig.cookieName];
  return cookie ?? null;
}

export function registerAuth(app: FastifyInstance, services: Services): void {
  app.decorateRequest("user", undefined);

  app.decorate("authenticate", async (req: FastifyRequest) => {
    const token = bearerOrCookie(req);
    const session = token ? await services.authService.resolve(token) : null;
    if (!session || !token) throw new ServiceError("unauthorized", "Authentication required");
    req.user = { userId: session.userId, scope: session.scope, token };
  });

  app.decorate("requireFullScope", async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (req.user!.scope !== "full") {
      throw new ServiceError("forbidden", "This action requires a full session (limited recovery/login sessions cannot perform it)");
    }
  });

  app.decorate("requireRecoveryKycScope", async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (req.user!.scope !== "recovery_kyc") {
      throw new ServiceError("forbidden", "This action requires a verified-recovery biometric challenge session");
    }
  });

  // VIEWER-OPTIONAL reads ([align-w4-api-surface]): public routes stay open to everyone, but a
  // presented FULL session resolves viewer-dependent fields (identity reveal, authorGeo, _my/_vote).
  // Never throws — an absent, expired, or limited-scope token simply reads as anonymous, so a stale
  // cookie can't lock a user out of public data.
  app.decorate("optionalAuthenticate", async (req: FastifyRequest) => {
    const token = bearerOrCookie(req);
    if (!token) return;
    const session = await services.authService.resolve(token);
    if (session && session.scope === "full") {
      req.user = { userId: session.userId, scope: session.scope, token };
    }
  });
}
