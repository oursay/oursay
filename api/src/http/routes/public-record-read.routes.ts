// Civic record PUBLIC READ routes (docs/01 §7; docs/06 §2–3). UNAUTHENTICATED — no `preHandler`
// and no `security`: aggregate public data is open to audit/research (§7.1). Routes stay thin:
// parse query → call PublicRecordReadService → reply. All fold/projection logic lives in
// @oursay/public-record; the service assembles, this layer only validates + shapes HTTP.
//
// Browse lists + thread detail + dedicated filterable count endpoints, per root type (post / petition
// / poll). On the count endpoints the geo `scope` AND the KYC `tier` set are RESOLVED (region-first +
// set-membership tier + k-anonymity); the date range is still a STUB — JSON-schema-validated (400 on a
// bad enum) and echoed (`applied.date` false), not resolved. Lists/detail apply no geo/tier filter
// (parse + echo only). See the service for semantics.

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";
import { GEO_SCOPES, KYC_TIERS, type PublicReadFilters } from "../../services/public-record-read.service.js";
import { errorSchema } from "../schemas.js";

// ── Reusable schema fragments ───────────────────────────────────────────────────────────────

const appliedSchema = {
  type: "object",
  description: "Per-dimension applied status. `geo`/`tier` are resolved on count endpoints; `date` is not yet implemented.",
  properties: {
    geo: { type: "boolean", description: "True when scope compiled to a region and narrowed the count." },
    tier: { type: "boolean", description: "True when a requested tier set narrowed the count (counts only; never on lists/detail)." },
    date: { type: "boolean", description: "Always false (date filtering not yet implemented)." },
  },
  required: ["geo", "tier", "date"],
} as const;

const tierEchoSchema = { type: "array", items: { type: "string", enum: KYC_TIERS }, nullable: true } as const;

const filtersEchoSchema = {
  type: "object",
  description: "Filter echo. `applied.geo`/`applied.tier` are resolved on count endpoints; date not yet implemented.",
  properties: {
    scope: { type: "string", enum: GEO_SCOPES },
    tier: tierEchoSchema,
    jurisdiction: { type: "string", nullable: true },
    from: { type: "string", nullable: true },
    to: { type: "string", nullable: true },
    applied: appliedSchema,
    kAnonymityFloor: {
      type: "integer",
      nullable: true,
      description: "Effective k-anonymity floor applied when a count is narrowed by geo or tier; null on lists/all-public(no tier)/my-district.",
    },
    note: { type: "string" },
  },
  required: ["scope", "tier", "jurisdiction", "from", "to", "applied", "kAnonymityFloor", "note"],
} as const;

const audienceScopeSchema = {
  type: "object",
  description: "Audience metadata for clients/future filters (not write-policy). Not PII.",
  properties: {
    jurisdiction: { type: "string", description: "Jurisdiction id (default oursay-global when no persona is bound)." },
    appliesToDistrictIds: {
      type: "array",
      items: { type: "string" },
      description: "District(s) the entity applies to (year-tagged ids); empty ⇒ whole jurisdiction.",
    },
  },
  required: ["jurisdiction", "appliesToDistrictIds"],
} as const;

// `count` is nullable + `suppressed` optional so the same shape serves the raw detail/list tallies
// (always an integer) and the geo-scoped count endpoints (null + suppressed:true below the k-anon floor).
const reactionCountSchema = {
  type: "object",
  properties: {
    kind: { type: "string" },
    count: { type: "integer", nullable: true, description: "Null when suppressed by the k-anonymity floor." },
    suppressed: { type: "boolean", description: "Present and true when this bucket was suppressed." },
  },
  required: ["kind", "count"],
} as const;
const reactionCountsArray = { type: "array", items: reactionCountSchema } as const;

const pollResultSchema = {
  type: "object",
  properties: {
    option: { type: "string" },
    count: { type: "integer", nullable: true, description: "Null when suppressed by the k-anonymity floor." },
    suppressed: { type: "boolean", description: "Present and true when this bucket was suppressed." },
  },
  required: ["option", "count"],
} as const;
const pollResultsArray = { type: "array", items: pollResultSchema } as const;

// A response-safe entity view (PublicEntityView): `content` is null when withheld (redacted/erased).
const publicEntityViewSchema = {
  type: "object",
  properties: {
    entityId: { type: "string" },
    type: { type: "string" },
    latestOp: { type: "string" },
    contentHash: { type: "string" },
    content: { description: "Opaque payload, or null when withheld.", nullable: true },
    withheld: { type: "boolean" },
    isDeleted: { type: "boolean" },
    isRedacted: { type: "boolean" },
    isErased: { type: "boolean" },
  },
  required: ["entityId", "type", "withheld", "isDeleted", "isRedacted", "isErased"],
} as const;

// A comment node in the folded tree (recursive). `replies` references this same shape via $ref'less
// open object to keep the static schema simple; the projection guarantees the structure.
const threadCommentSchema = {
  type: "object",
  properties: {
    state: publicEntityViewSchema,
    reactionsByEntity: reactionCountsArray,
    reactionsByCurrentRevision: reactionCountsArray,
    replies: { type: "array", items: { type: "object", additionalProperties: true } },
  },
  required: ["state", "reactionsByEntity", "reactionsByCurrentRevision", "replies"],
} as const;

const pageSchema = {
  type: "object",
  properties: {
    limit: { type: "integer" },
    offset: { type: "integer" },
    total: { type: "integer" },
  },
  required: ["limit", "offset", "total"],
} as const;

const summaryBaseProps = {
  entityId: { type: "string" },
  type: { type: "string" },
  content: { nullable: true },
  withheld: { type: "boolean" },
  createdAt: { type: "string" },
  audienceScope: audienceScopeSchema,
} as const;

// `tier` is repeatable (a SET): `?tier=a&tier=b`. Accept a single value OR an array without enabling
// global ajv array-coercion — anyOf still 400s on a bad enum value. The handlers normalize to KycTier[].
const tierQuery = {
  anyOf: [
    { type: "string", enum: KYC_TIERS },
    { type: "array", items: { type: "string", enum: KYC_TIERS } },
  ],
} as const;

const listQuerystring = {
  type: "object",
  properties: {
    scope: { type: "string", enum: GEO_SCOPES, description: "Coarse geo audience (echoed on lists, not resolved)." },
    tier: { ...tierQuery, description: "KYC tier(s); repeatable (echoed on lists, not resolved)." },
    jurisdiction: { type: "string", description: "Jurisdiction filter for multi-jurisdiction browse (echoed, not resolved)." },
    from: { type: "string", format: "date", description: "Start date, ISO (echoed, not resolved)." },
    to: { type: "string", format: "date", description: "End date, ISO (echoed, not resolved)." },
    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    offset: { type: "integer", minimum: 0, default: 0 },
  },
  additionalProperties: false,
} as const;

const countsQuerystring = {
  type: "object",
  properties: {
    scope: { type: "string", enum: GEO_SCOPES, description: "Coarse geo audience — RESOLVED on counts (region-first + k-anonymity); my-district is inert." },
    tier: { ...tierQuery, description: "KYC tier(s); repeatable. RESOLVED on counts: a participant is counted iff their current tier is in the set (set membership, not at-or-above)." },
    from: { type: "string", format: "date", description: "Start date, ISO (echoed, not resolved)." },
    to: { type: "string", format: "date", description: "End date, ISO (echoed, not resolved)." },
  },
  additionalProperties: false,
} as const;

const idParams = {
  type: "object",
  properties: { id: { type: "string", description: "Root entity id." } },
  required: ["id"],
} as const;

// Helpers to coerce parsed query into the service's filter shape. `tier` arrives as a single string
// (`?tier=a`) or an array (`?tier=a&tier=b`); normalize both to the KycTier[] the service expects.
function tierList(raw: unknown): PublicReadFilters["tier"] {
  if (Array.isArray(raw)) return raw as PublicReadFilters["tier"];
  if (raw != null) return [raw as NonNullable<PublicReadFilters["tier"]>[number]];
  return undefined;
}
function listFilters(q: Record<string, unknown>): PublicReadFilters {
  return {
    scope: q.scope as PublicReadFilters["scope"],
    tier: tierList(q.tier),
    jurisdiction: q.jurisdiction as string | undefined,
    from: q.from as string | undefined,
    to: q.to as string | undefined,
    limit: q.limit as number | undefined,
    offset: q.offset as number | undefined,
  };
}
function countFilters(q: Record<string, unknown>): PublicReadFilters {
  return {
    scope: q.scope as PublicReadFilters["scope"],
    tier: tierList(q.tier),
    from: q.from as string | undefined,
    to: q.to as string | undefined,
  };
}

export function registerPublicRecordReadRoutes(app: FastifyInstance, services: Services): void {
  const svc = services.publicRecordReadService;

  // ── POSTS (product label "Belief") ─────────────────────────────────────────────────────

  app.get(
    "/v1/public/posts",
    {
      schema: {
        tags: ["public"],
        summary: "Browse posts (Beliefs), newest first. Filters are echoed, not resolved (counts resolve geo/tier).",
        querystring: listQuerystring,
        response: {
          200: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { type: "object", properties: { ...summaryBaseProps, reactions: reactionCountsArray }, required: ["entityId", "type", "createdAt", "audienceScope", "reactions"] },
              },
              page: pageSchema,
              filters: filtersEchoSchema,
            },
            required: ["items", "page", "filters"],
          },
          400: errorSchema,
        },
      },
    },
    async (req) => svc.listPosts(listFilters(req.query as Record<string, unknown>)),
  );

  app.get(
    "/v1/public/posts/:id",
    {
      schema: {
        tags: ["public"],
        summary: "A post thread: root + reaction tallies + nested comments.",
        params: idParams,
        response: {
          200: {
            type: "object",
            properties: {
              root: publicEntityViewSchema,
              audienceScope: audienceScopeSchema,
              reactionsByEntity: reactionCountsArray,
              reactionsByCurrentRevision: reactionCountsArray,
              comments: { type: "array", items: threadCommentSchema },
            },
            required: ["root", "audienceScope", "reactionsByEntity", "reactionsByCurrentRevision", "comments"],
          },
          404: errorSchema,
        },
      },
    },
    async (req) => svc.getPost((req.params as { id: string }).id),
  );

  app.get(
    "/v1/public/posts/:id/counts",
    {
      schema: {
        tags: ["public"],
        summary: "Reaction tallies for a post (geo scope + KYC tier resolved + k-anonymity; date stubbed).",
        params: idParams,
        querystring: countsQuerystring,
        response: {
          200: {
            type: "object",
            properties: {
              entityId: { type: "string" },
              reactionsByEntity: reactionCountsArray,
              reactionsByCurrentRevision: reactionCountsArray,
              filters: filtersEchoSchema,
            },
            required: ["entityId", "reactionsByEntity", "reactionsByCurrentRevision", "filters"],
          },
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req) => svc.getPostCounts((req.params as { id: string }).id, countFilters(req.query as Record<string, unknown>)),
  );

  // ── PETITIONS ──────────────────────────────────────────────────────────────────────────

  app.get(
    "/v1/public/petitions",
    {
      schema: {
        tags: ["public"],
        summary: "Browse petitions, newest first. Filters are echoed, not resolved (counts resolve geo/tier).",
        querystring: listQuerystring,
        response: {
          200: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { type: "object", properties: { ...summaryBaseProps, signatureCount: { type: "integer" } }, required: ["entityId", "type", "createdAt", "audienceScope", "signatureCount"] },
              },
              page: pageSchema,
              filters: filtersEchoSchema,
            },
            required: ["items", "page", "filters"],
          },
          400: errorSchema,
        },
      },
    },
    async (req) => svc.listPetitions(listFilters(req.query as Record<string, unknown>)),
  );

  app.get(
    "/v1/public/petitions/:id",
    {
      schema: {
        tags: ["public"],
        summary: "A petition thread: root + signature count + reaction tallies + comments.",
        params: idParams,
        response: {
          200: {
            type: "object",
            properties: {
              root: publicEntityViewSchema,
              audienceScope: audienceScopeSchema,
              signatureCount: { type: "integer" },
              reactionsByEntity: reactionCountsArray,
              reactionsByCurrentRevision: reactionCountsArray,
              comments: { type: "array", items: threadCommentSchema },
            },
            required: ["root", "audienceScope", "signatureCount", "comments"],
          },
          404: errorSchema,
        },
      },
    },
    async (req) => svc.getPetition((req.params as { id: string }).id),
  );

  app.get(
    "/v1/public/petitions/:id/counts",
    {
      schema: {
        tags: ["public"],
        summary: "Signature count for a petition (geo scope + KYC tier resolved + k-anonymity; date stubbed; counts ungated in dev).",
        params: idParams,
        querystring: countsQuerystring,
        response: {
          200: {
            type: "object",
            properties: {
              entityId: { type: "string" },
              signatureCount: { type: "integer", nullable: true, description: "Null when suppressed by the k-anonymity floor." },
              suppressed: { type: "boolean", description: "True when the geo-scoped signature count was suppressed." },
              countGating: { type: "string", enum: ["none"] },
              countGatingNote: { type: "string" },
              filters: filtersEchoSchema,
            },
            required: ["entityId", "signatureCount", "suppressed", "countGating", "filters"],
          },
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req) => svc.getPetitionCounts((req.params as { id: string }).id, countFilters(req.query as Record<string, unknown>)),
  );

  // ── POLLS ──────────────────────────────────────────────────────────────────────────────

  app.get(
    "/v1/public/polls",
    {
      schema: {
        tags: ["public"],
        summary: "Browse polls, newest first. Filters are echoed, not resolved (counts resolve geo/tier).",
        querystring: listQuerystring,
        response: {
          200: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { type: "object", properties: { ...summaryBaseProps, results: pollResultsArray }, required: ["entityId", "type", "createdAt", "audienceScope", "results"] },
              },
              page: pageSchema,
              filters: filtersEchoSchema,
            },
            required: ["items", "page", "filters"],
          },
          400: errorSchema,
        },
      },
    },
    async (req) => svc.listPolls(listFilters(req.query as Record<string, unknown>)),
  );

  app.get(
    "/v1/public/polls/:id",
    {
      schema: {
        tags: ["public"],
        summary: "A poll thread: root + option results + reaction tallies + comments.",
        params: idParams,
        response: {
          200: {
            type: "object",
            properties: {
              root: publicEntityViewSchema,
              audienceScope: audienceScopeSchema,
              results: pollResultsArray,
              reactionsByEntity: reactionCountsArray,
              reactionsByCurrentRevision: reactionCountsArray,
              comments: { type: "array", items: threadCommentSchema },
            },
            required: ["root", "audienceScope", "results", "comments"],
          },
          404: errorSchema,
        },
      },
    },
    async (req) => svc.getPoll((req.params as { id: string }).id),
  );

  app.get(
    "/v1/public/polls/:id/counts",
    {
      schema: {
        tags: ["public"],
        summary: "Option results for a poll (geo scope + KYC tier resolved + k-anonymity; date stubbed; counts ungated in dev).",
        params: idParams,
        querystring: countsQuerystring,
        response: {
          200: {
            type: "object",
            properties: {
              entityId: { type: "string" },
              results: pollResultsArray,
              countGating: { type: "string", enum: ["none"] },
              countGatingNote: { type: "string" },
              filters: filtersEchoSchema,
            },
            required: ["entityId", "results", "countGating", "filters"],
          },
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req) => svc.getPollCounts((req.params as { id: string }).id, countFilters(req.query as Record<string, unknown>)),
  );
}
