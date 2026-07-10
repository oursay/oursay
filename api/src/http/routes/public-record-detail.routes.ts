// [align-w4-api-surface] P2/P3 — the viewer-optional, kind-agnostic RECORD DETAIL surface behind the
// web-app's PostView. `GET /v1/public/records/{id}` returns `{ detail, comments }` (the graduation
// chain's interlinks by id); `GET /v1/public/records/{id}/comments` returns just the nested thread
// (depth ≤ 3). VIEWER-OPTIONAL: a presented full session resolves identity reveal + authorGeo per
// node and the viewer's own `_my`/`_vote`; anonymous gets personas and no viewer state. A missing /
// deleted / non-root id is 404 (the surface does not exist) — never 403. Routes stay thin: resolve
// the viewer, call RecordDetailService, reply.

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";
import { KYC_TIERS } from "../../types/kyc.js";
import { errorSchema } from "../schemas.js";

const ROOT_TYPES = ["post", "petition", "poll", "result"] as const;
const AUTHOR_GEO = ["none", "home", "affected", "jurisdiction"] as const;

const identitySchema = {
  type: "object",
  description:
    "Viewer-resolved author identity: real name/handle iff the author's effective visibility admits this viewer; the per-thread persona otherwise (handle null — never leaked). Self resolves revealed, with a seenByOthersAs hint when not public.",
  properties: {
    display: { type: "string" },
    handle: { type: "string", nullable: true },
    isPersona: { type: "boolean" },
    isSelf: { type: "boolean" },
    seed: { type: "string" },
    threadId: { type: "string" },
    seenByOthersAs: { type: "string" },
  },
  required: ["display", "handle", "isPersona", "isSelf", "seed", "threadId"],
} as const;

const authorGeoSchema = {
  type: "string",
  enum: [...AUTHOR_GEO],
  description: "The author's narrowest viewer-relative spatial relation (C6) — the ONLY residence signal served.",
} as const;

const optionTallySchema = {
  type: "object",
  properties: {
    label: { type: "string" },
    v: { type: "integer", nullable: true, description: "Null when the jurisdiction's count policy withholds/tier-gates the scalar." },
  },
  required: ["label", "v"],
} as const;

const myReactionSchema = {
  type: "string",
  enum: ["up", "down"],
  nullable: true,
  description: "The viewer's own reaction on this entity (resolved through their per-thread persona); null/absent when anonymous or none.",
} as const;

// The comment tree is recursive; `replies` is an open-object array (the projection guarantees the
// CommentNode shape) so the static JSON schema stays simple — same convention as the legacy thread
// detail schema in public-record-read.routes.ts.
const commentNodeSchema = {
  type: "object",
  properties: {
    id: { type: "string", description: "Stable comment entity id (required for civic writes)." },
    author: { type: "string" },
    handle: { type: "string" },
    tier: { type: "string", enum: KYC_TIERS },
    official: { type: "boolean" },
    authorGeo: authorGeoSchema,
    ts: { type: "string" },
    edits: { type: "integer" },
    signTier: { type: "integer" },
    body: { type: "array", items: { type: "string" } },
    withheld: { type: "boolean" },
    up: { type: "integer" },
    down: { type: "integer" },
    _my: myReactionSchema,
    identity: identitySchema,
    replies: { type: "array", items: { type: "object", additionalProperties: true } },
  },
  required: ["id", "author", "handle", "tier", "official", "authorGeo", "ts", "edits", "signTier", "body", "withheld", "up", "down", "identity", "replies"],
} as const;

const detailSchema = {
  type: "object",
  description:
    "Detail-page root record (web-app RecordDetail). `type` (adapter → kind), `appliesToDistrictIds` (→ districts), interlinks by id; raw author districts NEVER appear (authorGeo is the only residence signal, C6).",
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
    authorGeo: authorGeoSchema,
    title: { type: "string" },
    body: { type: "array", items: { type: "string" } },
    withheld: { type: "boolean" },
    ts: { type: "string" },
    edits: { type: "integer" },
    up: { type: "integer" },
    down: { type: "integer" },
    sig: { type: "integer", nullable: true },
    goal: { type: "integer", nullable: true },
    options: { type: "array", items: optionTallySchema },
    attachedPoll: {
      type: "object",
      nullable: true,
      properties: { question: { type: "string" }, options: { type: "array", items: { type: "string" } } },
      required: ["question", "options"],
    },
    sourcePollId: { type: "string", nullable: true },
    sourcePetitionId: { type: "string", nullable: true },
    resultId: { type: "string", nullable: true },
    _my: myReactionSchema,
    _vote: { type: "string", nullable: true, description: "The viewer's own voted option label on a poll; null when not voted." },
  },
  required: [
    "id", "type", "jurisdiction", "tier", "official", "signTier", "appliesToDistrictIds",
    "author", "handle", "identity", "authorGeo", "title", "body", "withheld", "ts", "edits",
  ],
} as const;

const idParams = {
  type: "object",
  properties: { id: { type: "string", description: "Root entity id (any of post/petition/poll/result)." } },
  required: ["id"],
} as const;

export function registerPublicRecordDetailRoutes(app: FastifyInstance, services: Services): void {
  app.get(
    "/v1/public/records/:id",
    {
      preHandler: app.optionalAuthenticate,
      schema: {
        tags: ["public"],
        summary:
          "Kind-agnostic record detail: root + nested comment thread (depth ≤ 3). Viewer-optional — a session resolves identity reveal, authorGeo, and _my/_vote; anonymous gets personas.",
        params: idParams,
        response: {
          200: {
            type: "object",
            properties: {
              detail: detailSchema,
              comments: { type: "array", items: commentNodeSchema },
            },
            required: ["detail", "comments"],
          },
          404: errorSchema,
        },
      },
    },
    async (req) => {
      const viewer = await services.viewerContextService.resolve(req.user?.userId ?? null);
      return services.recordDetailService.getDetail((req.params as { id: string }).id, viewer);
    },
  );

  app.get(
    "/v1/public/records/:id/comments",
    {
      preHandler: app.optionalAuthenticate,
      schema: {
        tags: ["public"],
        summary: "The record's nested comment thread only (depth ≤ 3). Viewer-optional (same resolution as the detail).",
        params: idParams,
        response: {
          200: {
            type: "object",
            properties: {
              items: { type: "array", items: commentNodeSchema },
            },
            required: ["items"],
          },
          404: errorSchema,
        },
      },
    },
    async (req) => {
      const viewer = await services.viewerContextService.resolve(req.user?.userId ?? null);
      const items = await services.recordDetailService.getComments((req.params as { id: string }).id, viewer);
      return { items };
    },
  );
}
