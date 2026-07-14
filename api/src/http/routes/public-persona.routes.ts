// [align-w4-api-surface] P6 — thread-scoped persona profile behind the web-app's PersonaView.
// VIEWER-OPTIONAL: identity resolves through ReadResolution (reveal/self rules). Unknown persona
// names → 404 (not 403). Activity is scoped to ONE thread only — never cross-thread.

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";
import { KYC_TIERS } from "../../types/kyc.js";
import { ROOT_TYPES } from "../../services/public-feed.service.js";
import { errorSchema } from "../schemas.js";
import { activityItemSchema, identitySchema, mentionItemSchema } from "./public-page.schemas.js";

const supportSchema = {
  type: "object",
  properties: {
    agrees: { type: "integer" },
    disagrees: { type: "integer" },
    statements: { type: "integer" },
    comments: { type: "integer" },
  },
  required: ["agrees", "disagrees", "statements", "comments"],
} as const;

const commentNodeSchema = {
  type: "object",
  properties: {
    id: { type: "string", description: "Stable comment entity id." },
    author: { type: "string" },
    handle: { type: "string" },
    tier: { type: "string", enum: KYC_TIERS },
    authorGeo: { type: "string", enum: ["none", "home", "affected", "jurisdiction"] },
    ts: { type: "string" },
    edits: { type: "integer" },
    signTier: { type: "integer" },
    body: { type: "array", items: { type: "string" } },
    withheld: { type: "boolean" },
    up: { type: "integer" },
    down: { type: "integer" },
    identity: identitySchema,
    replies: { type: "array", items: { type: "object", additionalProperties: true } },
  },
  required: ["id", "author", "handle", "tier", "authorGeo", "ts", "edits", "signTier", "body", "withheld", "up", "down", "identity", "replies"],
} as const;

export function registerPublicPersonaRoutes(app: FastifyInstance, services: Services): void {
  app.get(
    "/v1/public/personas/:name",
    {
      preHandler: app.optionalAuthenticate,
      schema: {
        tags: ["public"],
        summary: "Thread-scoped persona profile: identity + authored comments within one thread",
        params: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              name: { type: "string" },
              threadId: { type: "string" },
              jurisdiction: { type: "string" },
              threadKind: { type: "string", enum: [...ROOT_TYPES] },
              threadTitle: { type: "string" },
              identity: identitySchema,
              tier: { type: "string", enum: KYC_TIERS },
              isRootAuthor: { type: "boolean" },
              support: supportSchema,
              comments: { type: "array", items: commentNodeSchema },
              activity: { type: "array", items: activityItemSchema },
              mentions: { type: "array", items: mentionItemSchema },
            },
            required: ["name", "threadId", "jurisdiction", "threadKind", "threadTitle", "identity", "tier", "isRootAuthor", "support", "comments", "activity", "mentions"],
          },
          404: errorSchema,
        },
      },
    },
    async (req) => {
      const { name } = req.params as { name: string };
      const viewer = await services.viewerContextService.resolve(req.user?.userId ?? null);
      return services.personaPageService.getPage(name, viewer);
    },
  );
}
