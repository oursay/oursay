// buildServer: assemble the Fastify app from a built Services graph. Registers cookie + rate-limit +
// OpenAPI (Swagger UI at /docs, spec at /openapi.json), the session auth decorators, the v1 routes,
// and the domain→HTTP error handler. Routes stay thin — all logic lives in services.

import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { sessionConfig } from "../config.js";
import type { Services } from "../container.js";
import { registerAuth } from "./auth-plugin.js";
import { registerErrorHandler } from "./errors.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerHealthRoutes } from "./routes/health.routes.js";
import { registerOtpRoutes } from "./routes/otp.routes.js";
import { registerPasskeyRoutes } from "./routes/passkey.routes.js";
import { registerProfileRoutes } from "./routes/profile.routes.js";
import { registerRecoveryRoutes } from "./routes/recovery.routes.js";
import { registerRegistrationRoutes } from "./routes/registration.routes.js";

export interface BuildServerOptions {
  logger?: boolean;
}

export async function buildServer(services: Services, opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "OurSay Account API",
        description:
          "Account registration & authentication. Email OTP is bootstrap/recovery only; WebAuthn " +
          "passkeys are the day-to-day login. These passkeys are the ACCOUNT-LOGIN factor and are " +
          "separate from the civic thread-signing keys in @oursay/public-record.",
        version: "1.0.0",
      },
      tags: [
        { name: "auth", description: "Registration, sessions, OTP" },
        { name: "passkey", description: "WebAuthn passkey enrollment + login" },
        { name: "recovery", description: "Account recovery via email OTP" },
        { name: "profile", description: "Private account profile" },
        { name: "meta", description: "Health & docs" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", description: "Opaque session token" },
          cookieAuth: { type: "apiKey", in: "cookie", name: sessionConfig.cookieName },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  registerErrorHandler(app);
  registerAuth(app, services);

  registerHealthRoutes(app, services);
  registerOtpRoutes(app, services);
  registerRegistrationRoutes(app, services);
  registerPasskeyRoutes(app, services);
  registerAuthRoutes(app, services);
  registerRecoveryRoutes(app, services);
  registerProfileRoutes(app, services);

  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  await app.ready();
  return app;
}
