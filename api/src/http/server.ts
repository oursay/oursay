// buildServer: assemble the Fastify app from a built Services graph. Registers cookie + rate-limit +
// OpenAPI (Swagger UI at /docs, spec at /openapi.json), the session auth decorators, the v1 routes,
// and the domain→HTTP error handler. Routes stay thin — all logic lives in services.

import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { isProduction, sessionConfig } from "../config.js";
import type { Services } from "../container.js";
import { registerAuth } from "./auth-plugin.js";
import { registerErrorHandler } from "./errors.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerCivicDeviceRoutes } from "./routes/civic-device.routes.js";
import { registerCivicRecordRoutes } from "./routes/civic-record.routes.js";
import { registerExplorerRoutes } from "./routes/explorer.routes.js";
import { registerHealthRoutes } from "./routes/health.routes.js";
import { registerLoginRoutes } from "./routes/login.routes.js";
import { registerOtpRoutes } from "./routes/otp.routes.js";
import { registerPasskeyRoutes } from "./routes/passkey.routes.js";
import { registerPlatformOpsRoutes } from "./routes/platform-ops.routes.js";
import { registerKycDevRoutes } from "./routes/kyc-dev.routes.js";
import { registerMembershipDevRoutes } from "./routes/membership-dev.routes.js";
import { registerKycRoutes } from "./routes/kyc.routes.js";
import { registerProfileRoutes } from "./routes/profile.routes.js";
import { registerMeRoutes } from "./routes/me.routes.js";
import { registerPublicAreaCatalogRoutes } from "./routes/public-area-catalog.routes.js";
import { registerPublicFeedRoutes } from "./routes/public-feed.routes.js";
import { registerPublicRecordDetailRoutes } from "./routes/public-record-detail.routes.js";
import { registerPublicOfficialRoutes } from "./routes/public-official.routes.js";
import { registerPublicPersonaRoutes } from "./routes/public-persona.routes.js";
import { registerPublicProfileRoutes } from "./routes/public-profile.routes.js";
import { registerPublicRecordReadRoutes } from "./routes/public-record-read.routes.js";
import { registerRecoveryRoutes } from "./routes/recovery.routes.js";
import { registerRegistrationRoutes } from "./routes/registration.routes.js";
import { registerWalkRoutes } from "./routes/walk.routes.js";

export interface BuildServerOptions {
  logger?: boolean;
  /** Register the HTTP rate-limit plugin (per-route `config.rateLimit` is inert without it). Tests
   *  disable it so the in-memory counters don't accumulate across the shared app; the real, tested
   *  guard is the service-layer limiter (auth.otp_rate_limits), which is reset per test. */
  rateLimit?: boolean;
}

export async function buildServer(services: Services, opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });

  await app.register(cookie);
  if (opts.rateLimit ?? true) await app.register(rateLimit, { global: false });

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
        { name: "auth", description: "Registration, sessions, unified OTP request" },
        { name: "passkey", description: "WebAuthn passkey enrollment + login (multi-device)" },
        { name: "login", description: "Gated cross-device sign-in via login OTP" },
        { name: "recovery", description: "Account recovery via email OTP" },
        { name: "civic", description: "Civic signing device keys (public key only; separate from login passkeys)" },
        { name: "public", description: "Unauthenticated public reads: the civic record (browse/detail/counts) and the area catalog (jurisdictions + district boundaries)" },
        { name: "explorer", description: "Unauthenticated auditor/explorer reads: chain tip, blocks, and txs (not a full sync/stream)" },
        { name: "profile", description: "Private account profile" },
        { name: "me", description: "Authenticated self-scoped account surface" },
        { name: "kyc", description: "Identity and residency verification (Didit sessions, platform residency attest)" },
        { name: "platform-ops", description: "Platform-signed ops (admin prepare/submit; seat assignment today)" },
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
  registerLoginRoutes(app, services);
  registerCivicDeviceRoutes(app, services);
  registerCivicRecordRoutes(app, services);
  await registerPlatformOpsRoutes(app, services);
  registerExplorerRoutes(app, services);
  registerPublicRecordReadRoutes(app, services);
  registerPublicFeedRoutes(app, services);
  registerPublicRecordDetailRoutes(app, services);
  registerPublicPersonaRoutes(app, services);
  registerPublicOfficialRoutes(app, services);
  registerPublicProfileRoutes(app, services);
  registerPublicAreaCatalogRoutes(app, services);
  registerProfileRoutes(app, services);
  registerMeRoutes(app, services);
  await registerKycRoutes(app, services);

  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  // Dev-only manual QA surfaces — never exposed in production: the /walk harness and the KYC
  // self-attest route (so tests/QA can place a user at a tier without a raw kyc_attestations INSERT).
  if (!isProduction) {
    registerWalkRoutes(app);
    registerKycDevRoutes(app, services);
    registerMembershipDevRoutes(app, services);
  }

  await app.ready();
  return app;
}
