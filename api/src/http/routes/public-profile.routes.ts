// [align-w4-api-surface] P4/P5 — account-level public profile (header + posts + activity + mentions).
// VIEWER-OPTIONAL: the whole surface 404s when the viewer is outside the account's visibility
// scope (not 403 — docs/09 §3). Mentions rows are further gated by threadRevealed (docs/09 §2).

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";
import { KYC_TIERS } from "../../types/kyc.js";
import { errorSchema } from "../schemas.js";
import { ROOT_TYPES } from "../../services/public-feed.service.js";
import { ACTIVITY_KINDS, PROFILE_POST_TYPES } from "../../services/profile-page.service.js";
import { activityItemSchema, identitySchema, mentionItemSchema } from "./public-page.schemas.js";

const feedItemSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    type: { type: "string", enum: [...ROOT_TYPES] },
    jurisdiction: { type: "string" },
    tier: { type: "string", enum: KYC_TIERS },
    official: { type: "boolean" },
    signTier: { type: "integer" },
    appliesToDistrictIds: { type: "array", items: { type: "string" } },
    author: { type: "string" },
    handle: { type: "string" },
    identity: identitySchema,
    authorGeo: { type: "string", enum: ["none", "home", "affected", "jurisdiction"] },
    title: { type: "string" },
    body: { type: "array", items: { type: "string" } },
    withheld: { type: "boolean" },
    up: { type: "integer" },
    down: { type: "integer" },
    sig: { type: "integer", nullable: true },
    goal: { type: "integer", nullable: true },
    options: { type: "array", items: { type: "object", additionalProperties: true } },
    attachedPoll: { type: "object", nullable: true, additionalProperties: true },
    comments: { type: "integer" },
    edits: { type: "integer" },
    ts: { type: "string" },
  },
  required: [
    "id", "type", "jurisdiction", "tier", "official", "signTier", "appliesToDistrictIds",
    "author", "handle", "identity", "authorGeo", "title", "body", "withheld", "comments", "edits", "ts",
  ],
} as const;

const profileHeaderSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    handle: { type: "string" },
    role: { type: "string" },
    roles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          roleLabel: { type: "string" },
          placeLabel: { type: "string" },
          jurisdictionId: { type: "string" },
          districtSlug: { type: ["string", "null"] },
          seatHandle: { type: ["string", "null"] },
          placeKind: { type: "string", enum: ["jurisdiction", "district"] },
        },
        required: ["roleLabel", "placeLabel", "jurisdictionId", "districtSlug", "seatHandle", "placeKind"],
      },
    },
    tier: { type: "string", enum: KYC_TIERS },
    official: { type: "boolean" },
    bio: { type: "string" },
    iconType: { type: "string" },
    ageLabel: { type: "string" },
    support: {
      type: "object",
      properties: {
        agrees: { type: "integer" },
        disagrees: { type: "integer" },
        statements: { type: "integer" },
        comments: { type: "integer" },
      },
      required: ["agrees", "disagrees", "statements", "comments"],
    },
  },
  required: ["name", "handle", "role", "roles", "tier", "official", "bio", "iconType", "ageLabel", "support"],
} as const;

const typesQuery = {
  anyOf: [
    { type: "string", enum: [...PROFILE_POST_TYPES] },
    { type: "array", items: { type: "string", enum: [...PROFILE_POST_TYPES] } },
  ],
} as const;

const kindsQuery = {
  anyOf: [
    { type: "string", enum: [...ACTIVITY_KINDS] },
    { type: "array", items: { type: "string", enum: [...ACTIVITY_KINDS] } },
  ],
} as const;

function asList<T>(raw: unknown): T[] | undefined {
  if (Array.isArray(raw)) return raw as T[];
  if (raw != null) return [raw as T];
  return undefined;
}

export function registerPublicProfileRoutes(app: FastifyInstance, services: Services): void {
  app.get(
    "/v1/public/profiles/:handle",
    {
      preHandler: app.optionalAuthenticate,
      schema: {
        tags: ["public"],
        summary: "Public profile header (404 when viewer is outside the account visibility scope)",
        params: {
          type: "object",
          properties: { handle: { type: "string" } },
          required: ["handle"],
        },
        response: {
          200: profileHeaderSchema,
          404: errorSchema,
        },
      },
    },
    async (req) => {
      const { handle } = req.params as { handle: string };
      const viewer = await services.viewerContextService.resolve(req.user?.userId ?? null);
      return services.profilePageService.getHeader(handle, viewer);
    },
  );

  app.get(
    "/v1/public/profiles/:handle/posts",
    {
      preHandler: app.optionalAuthenticate,
      schema: {
        tags: ["public"],
        summary: "Profile Posts tab — authored root records as FeedItems (results excluded)",
        params: {
          type: "object",
          properties: { handle: { type: "string" } },
          required: ["handle"],
        },
        querystring: {
          type: "object",
          properties: {
            types: { ...typesQuery, description: "Root type filter; repeatable. Absent = post+petition+poll." },
            cursor: { type: "string", description: "Opaque page cursor from nextCursor." },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              items: { type: "array", items: feedItemSchema },
              nextCursor: { type: "string", nullable: true },
            },
            required: ["items", "nextCursor"],
          },
          404: errorSchema,
        },
      },
    },
    async (req) => {
      const { handle } = req.params as { handle: string };
      const q = req.query as Record<string, unknown>;
      const viewer = await services.viewerContextService.resolve(req.user?.userId ?? null);
      return services.profilePageService.listPosts(handle, viewer, {
        types: asList(q.types),
        cursor: q.cursor as string | undefined,
        limit: q.limit as number | undefined,
      });
    },
  );

  app.get(
    "/v1/public/profiles/:handle/activity",
    {
      preHandler: app.optionalAuthenticate,
      schema: {
        tags: ["public"],
        summary: "Profile Activity tab — first-class actions derived from record_tx",
        params: {
          type: "object",
          properties: { handle: { type: "string" } },
          required: ["handle"],
        },
        querystring: {
          type: "object",
          properties: {
            kinds: { ...kindsQuery, description: "Activity kind filter; repeatable." },
            cursor: { type: "string", description: "Opaque page cursor from nextCursor." },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              items: { type: "array", items: activityItemSchema },
              nextCursor: { type: "string", nullable: true },
            },
            required: ["items", "nextCursor"],
          },
          404: errorSchema,
        },
      },
    },
    async (req) => {
      const { handle } = req.params as { handle: string };
      const q = req.query as Record<string, unknown>;
      const viewer = await services.viewerContextService.resolve(req.user?.userId ?? null);
      return services.profilePageService.listActivity(handle, viewer, {
        kinds: asList(q.kinds),
        cursor: q.cursor as string | undefined,
        limit: q.limit as number | undefined,
      });
    },
  );

  app.get(
    "/v1/public/profiles/:handle/mentions",
    {
      preHandler: app.optionalAuthenticate,
      schema: {
        tags: ["public"],
        summary:
          "Profile Mentions tab — related mention_index cites gated by threadRevealed (docs/09 §2)",
        params: {
          type: "object",
          properties: { handle: { type: "string" } },
          required: ["handle"],
        },
        querystring: {
          type: "object",
          properties: {
            cursor: {
              type: "string",
              description: "Opaque page cursor from nextCursor (ISO created_at).",
            },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              items: { type: "array", items: mentionItemSchema },
              nextCursor: { type: "string", nullable: true },
            },
            required: ["items", "nextCursor"],
          },
          404: errorSchema,
        },
      },
    },
    async (req) => {
      const { handle } = req.params as { handle: string };
      const q = req.query as Record<string, unknown>;
      const viewer = await services.viewerContextService.resolve(req.user?.userId ?? null);
      return services.profilePageService.listMentions(handle, viewer, {
        cursor: q.cursor as string | undefined,
        limit: q.limit as number | undefined,
      });
    },
  );
}
