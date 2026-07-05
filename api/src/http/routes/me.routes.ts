// Authenticated self-scoped account surface (/v1/me/*). Full session required; roles and platform
// assignments are never writable here — membership PUT only adds/removes jurisdiction subscriptions.

import type { FastifyInstance } from "fastify";
import { ServiceError } from "../../errors.js";
import type { Services } from "../../container.js";
import type { UpdateProfileInput } from "../../repo/profile.repo.js";
import { AUTHOR_VISIBILITIES } from "../../types/visibility.js";
import { bearerSecurity, errorSchema } from "../schemas.js";

const HOME_JURISDICTION = "oursay-global";

const signingPrefSchema = { type: "string", enum: ["quick", "ask", "passkey"] } as const;

export function registerMeRoutes(app: FastifyInstance, services: Services): void {
  app.get(
    "/v1/me/jurisdictions",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["me"],
        summary: "List the authenticated user's jurisdiction memberships",
        security: bearerSecurity,
        response: {
          200: {
            type: "object",
            properties: {
              jurisdictionIds: { type: "array", items: { type: "string" } },
            },
            required: ["jurisdictionIds"],
          },
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (req) => {
      const rows = await services.repos.membership.listForUser(req.user!.userId);
      return { jurisdictionIds: rows.map((r) => r.jurisdictionId) };
    },
  );

  app.put(
    "/v1/me/jurisdictions",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["me"],
        summary: "Replace jurisdiction subscriptions (oursay-global is always retained; roles are never changed)",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: {
            jurisdictionIds: { type: "array", items: { type: "string" } },
          },
          required: ["jurisdictionIds"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              jurisdictionIds: { type: "array", items: { type: "string" } },
            },
            required: ["jurisdictionIds"],
          },
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req) => {
      const userId = req.user!.userId;
      const body = req.body as { jurisdictionIds: string[] };
      const desired = new Set(body.jurisdictionIds);
      desired.add(HOME_JURISDICTION);
      for (const id of desired) {
        if (!services.areaCatalogService.listJurisdictions().some((j) => j.id === id)) {
          throw new ServiceError("not_found", `unknown jurisdiction: ${id}`);
        }
      }
      const current = await services.repos.membership.listForUser(userId);
      const currentIds = new Set(current.map((r) => r.jurisdictionId));
      for (const id of desired) {
        if (!currentIds.has(id)) await services.repos.membership.add(userId, id);
      }
      for (const id of currentIds) {
        if (!desired.has(id)) await services.repos.membership.remove(userId, id);
      }
      const rows = await services.repos.membership.listForUser(userId);
      return { jurisdictionIds: rows.map((r) => r.jurisdictionId) };
    },
  );

  app.get(
    "/v1/me/signing-prefs",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["me"],
        summary: "Get per-action signing preferences",
        security: bearerSecurity,
        response: {
          200: {
            type: "object",
            additionalProperties: signingPrefSchema,
          },
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (req) => services.repos.signingPrefs.get(req.user!.userId),
  );

  app.patch(
    "/v1/me/signing-prefs",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["me"],
        summary: "Merge signing preferences (null deletes a key)",
        security: bearerSecurity,
        body: {
          type: "object",
          additionalProperties: { oneOf: [signingPrefSchema, { type: "null" }] },
        },
        response: {
          200: {
            type: "object",
            additionalProperties: signingPrefSchema,
          },
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (req) => {
      const patch = req.body as Record<string, "quick" | "ask" | "passkey" | null>;
      return services.repos.signingPrefs.patch(req.user!.userId, patch);
    },
  );

  app.get(
    "/v1/me/visibility",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["me"],
        summary: "Get the account-default author visibility",
        security: bearerSecurity,
        response: {
          200: {
            type: "object",
            properties: {
              visibility: { type: "string", enum: AUTHOR_VISIBILITIES },
            },
            required: ["visibility"],
          },
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req) => {
      const profile = await services.repos.profile.getByUserId(req.user!.userId);
      if (!profile) throw new ServiceError("not_found", "Profile not found");
      return { visibility: profile.visibility };
    },
  );

  app.patch(
    "/v1/me/visibility",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["me"],
        summary: "Set the account-default author visibility",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: {
            visibility: { type: "string", enum: AUTHOR_VISIBILITIES },
          },
          required: ["visibility"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              visibility: { type: "string", enum: AUTHOR_VISIBILITIES },
            },
            required: ["visibility"],
          },
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req) => {
      const userId = req.user!.userId;
      const { visibility } = req.body as { visibility: (typeof AUTHOR_VISIBILITIES)[number] };
      const profile = await services.repos.profile.getByUserId(userId);
      if (!profile) throw new ServiceError("not_found", "Profile not found");
      await services.repos.profile.setVisibility(userId, visibility);
      return { visibility };
    },
  );

  app.put(
    "/v1/me/threads/:threadId/visibility",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["me"],
        summary: "Set or clear a per-thread visibility override (null clears)",
        security: bearerSecurity,
        params: {
          type: "object",
          properties: { threadId: { type: "string" } },
          required: ["threadId"],
        },
        body: {
          type: "object",
          properties: {
            visibility: { oneOf: [{ type: "string", enum: AUTHOR_VISIBILITIES }, { type: "null" }] },
          },
          required: ["visibility"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              visibility: { oneOf: [{ type: "string", enum: AUTHOR_VISIBILITIES }, { type: "null" }] },
            },
            required: ["visibility"],
          },
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req) => {
      const userId = req.user!.userId;
      const { threadId } = req.params as { threadId: string };
      const { visibility } = req.body as { visibility: string | null };
      const ok = await services.recordStore.setThreadVisibility(userId, threadId, visibility);
      if (!ok) throw new ServiceError("not_found", "No persona in this thread");
      return { visibility };
    },
  );

  app.get(
    "/v1/me/districts",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["me"],
        summary: "Home district slugs for the authenticated viewer (self-only raw slugs)",
        security: bearerSecurity,
        response: {
          200: {
            type: "object",
            properties: {
              districts: { type: "array", items: { type: "string" } },
            },
            required: ["districts"],
          },
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (req) => {
      const viewer = await services.viewerContextService.resolve(req.user!.userId);
      return { districts: viewer.homeDistricts };
    },
  );

  const idsQuery = {
    anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
  } as const;

  function asList(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw as string[];
    if (raw != null) return [raw as string];
    return [];
  }

  app.get(
    "/v1/me/record-state",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["me"],
        summary: "Batch read of the viewer's own participation markers (_my, _vote, signed, shared) per record id",
        security: bearerSecurity,
        querystring: {
          type: "object",
          properties: {
            ids: { ...idsQuery, description: "Record ids; repeatable query param (max 100)." },
          },
          required: ["ids"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              states: {
                type: "object",
                additionalProperties: {
                  type: "object",
                  properties: {
                    _my: { type: "string", enum: ["up", "down"], nullable: true },
                    _vote: { type: "string", nullable: true },
                    signed: { type: "boolean" },
                    shared: { type: "boolean" },
                  },
                  required: ["_my", "_vote", "signed", "shared"],
                },
              },
            },
            required: ["states"],
          },
          401: errorSchema,
          403: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (req) => {
      const viewer = await services.viewerContextService.resolve(req.user!.userId);
      const q = req.query as { ids?: unknown };
      return services.recordStateService.getStates(asList(q.ids), viewer);
    },
  );

  app.post(
    "/v1/me/shares/:shareKey",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["me"],
        summary: "Record a share mark for deduplicated share counts",
        security: bearerSecurity,
        params: {
          type: "object",
          properties: { shareKey: { type: "string" } },
          required: ["shareKey"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              counted: { type: "boolean" },
              count: { type: "number" },
            },
            required: ["counted", "count"],
          },
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (req) => {
      const userId = req.user!.userId;
      const { shareKey } = req.params as { shareKey: string };
      const counted = await services.recordStore.addShareMark(userId, shareKey);
      const count = await services.recordStore.shareCount(shareKey);
      return { counted, count };
    },
  );
}