// Unified public feed ([align-w4-api-surface] P1) — the FeedView's one list (CONTRACT.md §1).
// VIEWER-OPTIONAL: no security requirement, but a presented full session resolves the
// viewer-dependent fields (identity reveal, authorGeo) server-side; the anonymous variant is the
// cacheable one (C6 documents the CDN trade-off). Route stays thin: parse query → resolve viewer →
// PublicFeedService → reply.

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";
import { ROOT_TYPES, type FeedQuery } from "../../services/public-feed.service.js";
import { KYC_TIERS } from "../../types/kyc.js";
import { errorSchema } from "../schemas.js";

const identitySchema = {
  type: "object",
  description:
    "Viewer-resolved author identity (docs/09): real name/handle iff the author's effective visibility admits this viewer; the per-thread persona otherwise (handle null — never leaked). Self always resolves revealed, with a seenByOthersAs persona hint when not publicly visible.",
  properties: {
    display: { type: "string" },
    handle: { type: "string", nullable: true, description: "Real @handle iff revealed or self; null for personas." },
    isPersona: { type: "boolean" },
    isSelf: { type: "boolean" },
    seed: { type: "string", description: "Avatar seed: real handle when revealed, persona name otherwise." },
    threadId: { type: "string" },
    seenByOthersAs: { type: "string", description: "Self only, when own effective visibility is not public." },
  },
  required: ["display", "handle", "isPersona", "isSelf", "seed", "threadId"],
} as const;

const optionTallySchema = {
  type: "object",
  properties: {
    label: { type: "string" },
    v: { type: "integer", nullable: true, description: "Null when the jurisdiction's count policy withholds/tier-gates votes." },
  },
  required: ["label", "v"],
} as const;

const feedItemSchema = {
  type: "object",
  description:
    "FeedItem-shaped row (web-app CONTRACT.md §1 + Part 3). Jurisdiction is an ID (labels resolve client-side); appliesToDistrictIds is the served name for the affected seat slugs (the adapter maps it to the mock's `districts`); raw author districts NEVER appear — authorGeo is the only residence signal (C6).",
  properties: {
    id: { type: "string" },
    type: { type: "string", enum: [...ROOT_TYPES] },
    jurisdiction: { type: "string", description: 'Jurisdiction id, e.g. "oursay-global" | "ab-ca-gov".' },
    tier: { type: "string", enum: KYC_TIERS, description: "Author's canonical KYC tier token (client maps to its numeric ladder)." },
    official: { type: "boolean", description: "Author holds the official ROLE in this jurisdiction (never a tier)." },
    signTier: { type: "integer", description: "Envelope sign-tier projection: 0 quick · 1 passkey (2/3 future)." },
    appliesToDistrictIds: { type: "array", items: { type: "string" }, description: "Affected seat slugs; [] = jurisdiction-wide." },
    author: { type: "string", description: "Anonymized display: real name when revealed, persona otherwise." },
    handle: { type: "string", description: "Real @handle when revealed; the persona name otherwise." },
    identity: identitySchema,
    authorGeo: {
      type: "string",
      enum: ["none", "home", "affected", "jurisdiction"],
      description: "The author's narrowest viewer-relative spatial relation (C6) — the ONLY residence signal served.",
    },
    title: { type: "string" },
    body: { type: "array", items: { type: "string" }, description: "Paragraphs." },
    withheld: { type: "boolean", description: "Content redacted/erased — title/body empty, the row provably present." },
    up: { type: "integer" },
    down: { type: "integer" },
    sig: { type: "integer", nullable: true, description: "Signature count; null when withheld/tier-gated by count policy." },
    goal: { type: "integer", nullable: true, description: "Graduation threshold when the jurisdiction sets a fixed one." },
    options: { type: "array", items: optionTallySchema },
    attachedPoll: {
      type: "object",
      nullable: true,
      properties: { question: { type: "string" }, options: { type: "array", items: { type: "string" } } },
      required: ["question", "options"],
    },
    comments: { type: "integer", description: "Live comment count, all nesting depths." },
    edits: { type: "integer", description: "Revision count (update transactions)." },
    ts: { type: "string", description: "Original create time, ISO." },
  },
  required: [
    "id", "type", "jurisdiction", "tier", "official", "signTier", "appliesToDistrictIds",
    "author", "handle", "identity", "authorGeo", "title", "body", "withheld", "comments", "edits", "ts",
  ],
} as const;

// Repeatable query params: accept a single value OR an array (same pattern as the tier filter on
// the count endpoints) — anyOf still 400s on a bad enum value.
const typesQuery = {
  anyOf: [
    { type: "string", enum: [...ROOT_TYPES] },
    { type: "array", items: { type: "string", enum: [...ROOT_TYPES] } },
  ],
} as const;
const jurisdictionsQuery = {
  anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
} as const;

function asList<T>(raw: unknown): T[] | undefined {
  if (Array.isArray(raw)) return raw as T[];
  if (raw != null) return [raw as T];
  return undefined;
}

export function registerPublicFeedRoutes(app: FastifyInstance, services: Services): void {
  app.get(
    "/v1/public/feed",
    {
      preHandler: app.optionalAuthenticate,
      schema: {
        tags: ["public"],
        summary:
          "Unified feed: every root type across jurisdictions, newest first, cursor-paginated. Viewer-optional — a presented session resolves identity reveal + authorGeo; anonymous gets personas.",
        querystring: {
          type: "object",
          properties: {
            types: { ...typesQuery, description: "Root type filter; repeatable. Absent = all four." },
            jurisdictions: { ...jurisdictionsQuery, description: "Jurisdiction id filter; repeatable. Absent = all." },
            tierMin: {
              type: "integer",
              minimum: 0,
              maximum: 3,
              default: 0,
              description: "Author verification floor: 0 any · 1 identity · 2 residency · 3 official (role).",
            },
            signedMin: {
              type: "integer",
              minimum: 0,
              maximum: 3,
              default: 0,
              description: "Envelope sign-tier floor: 0 any · 1 passkey (2/3 future).",
            },
            cursor: { type: "string", description: "Opaque page cursor from the previous response's nextCursor." },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              items: { type: "array", items: feedItemSchema },
              nextCursor: { type: "string", nullable: true, description: "Pass back as `cursor`; null = no more rows." },
            },
            required: ["items", "nextCursor"],
          },
          400: errorSchema,
        },
      },
    },
    async (req) => {
      const q = req.query as Record<string, unknown>;
      const query: FeedQuery = {
        types: asList(q.types),
        jurisdictions: asList(q.jurisdictions),
        tierMin: q.tierMin as FeedQuery["tierMin"],
        signedMin: q.signedMin as number | undefined,
        cursor: q.cursor as string | undefined,
        limit: q.limit as number | undefined,
      };
      const viewer = await services.viewerContextService.resolve(req.user?.userId ?? null);
      return services.publicFeedService.list(query, viewer);
    },
  );
}
