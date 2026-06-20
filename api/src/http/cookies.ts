// Session cookie helpers. The SAME opaque token works as a Bearer credential or an HttpOnly cookie;
// browser clients get the cookie set on registration/login and cleared on logout.

import type { FastifyReply } from "fastify";
import { sessionConfig } from "../config.js";

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: string): void {
  reply.setCookie(sessionConfig.cookieName, token, {
    httpOnly: true,
    secure: sessionConfig.cookieSecure,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(sessionConfig.cookieName, { path: "/" });
}
