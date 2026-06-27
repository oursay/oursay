// Public AREA CATALOG routes (docs/01 §7.2; closes [mvp-c6-area-catalog]). UNAUTHENTICATED — no
// `preHandler`, no `security`: official electoral boundary data is open to clients (maps, labels,
// independent audit). Routes stay thin: parse → AreaCatalogService → reply; all selection logic lives
// in @oursay/geo's GeoStore (effective-dated `listDistrictsAsOf`) and the service.
//
// Privacy (docs/06 §2–3): this surface exposes ONLY official ingested district revisions — never user
// geocode points, addresses, geo.regions custom presets, or sub-riding voting-area tiles, and there is
// no freeform district-id query. Geometry is the public electoral-authority boundary, appropriate for
// public maps and audit.

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";
import { errorSchema } from "../schemas.js";

// One district revision's public metadata. `geometry` is present only on `?include=geometry` lists and
// is an opaque GeoJSON MultiPolygon (validated by PostGIS on ingest), so it stays an open object here.
const districtItemSchema = {
  type: "object",
  properties: {
    id: { type: "string", description: "Stable district revision id (year-anchored slug)." },
    name: { type: "string", description: "Display name of the riding." },
    ridingSlug: { type: "string", description: "Year-less logical-riding key grouping revisions across redraws." },
    effectiveDate: { type: "string", description: "First day this geometry is in force (YYYY-MM-DD); the asOf lookup key." },
    drawnDate: { type: "string", nullable: true, description: "When the boundary was drawn/enacted, if known (YYYY-MM-DD)." },
    source: { type: "string", description: "Provenance (file + authority)." },
    sourceRef: { type: "string", nullable: true, description: "Original source id (e.g. EDNumber20)." },
    geometry: {
      type: "object",
      additionalProperties: true,
      description: "Official boundary as a GeoJSON MultiPolygon (EPSG:4326). Present only when include=geometry.",
    },
  },
  required: ["id", "name", "ridingSlug", "effectiveDate", "source"],
} as const;

// Per-record-type display labels (docs/GLOSSARY "Civic content vocabulary"). Display only; absent keys
// ⇒ client falls back to platform defaults (Statement/Petition/Poll/Result/District).
const jurisdictionLabelsSchema = {
  type: "object",
  properties: {
    post: { type: "string", description: "Label for a `post` (default: Statement)." },
    petition: { type: "string", description: "Label for a `petition` (default: Petition)." },
    poll: { type: "string", description: "Label for a `poll` (default: Poll)." },
    result: { type: "string", description: "Label for a poll `result` (default: Result)." },
    district: { type: "string", description: "Label for a district (e.g. Alberta: riding)." },
  },
} as const;

// Hard per-type content caps (max sizes). Numbers are character limits except poll.maxOptions (count).
const jurisdictionContentLimitsSchema = {
  type: "object",
  properties: {
    post: {
      type: "object",
      properties: { title: { type: "number" }, body: { type: "number" } },
    },
    comment: {
      type: "object",
      properties: { body: { type: "number" } },
    },
    petition: {
      type: "object",
      properties: { title: { type: "number" }, text: { type: "number" } },
    },
    poll: {
      type: "object",
      properties: {
        question: { type: "number" },
        option: { type: "number" },
        maxOptions: { type: "number" },
        description: { type: "number" },
      },
    },
  },
} as const;

const jurisdictionsResponse = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          level: { type: "string", description: "Governmental tier (federal | provincial | municipal | …)." },
          label: { type: "string", description: "Public display name; absent ⇒ fall back to id." },
          labels: jurisdictionLabelsSchema,
          contentLimits: jurisdictionContentLimitsSchema,
        },
        required: ["id", "level"],
      },
    },
  },
  required: ["items"],
} as const;

const districtsResponse = {
  type: "object",
  properties: {
    jurisdictionId: { type: "string" },
    asOf: { type: "string", description: "The resolved UTC calendar date (YYYY-MM-DD) the directory was selected at." },
    items: { type: "array", items: districtItemSchema },
  },
  required: ["jurisdictionId", "asOf", "items"],
} as const;

const districtsQuerystring = {
  type: "object",
  properties: {
    asOf: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      description: "UTC calendar date (YYYY-MM-DD). Default: today's UTC date. Selects one revision per riding (latest effective_date <= asOf).",
    },
    include: {
      type: "string",
      enum: ["geometry"],
      description: "include=geometry embeds each riding's GeoJSON boundary. Heavy for a full jurisdiction (~tens of MultiPolygons); default is metadata-only.",
    },
  },
  additionalProperties: false,
} as const;

const jurisdictionParams = {
  type: "object",
  properties: { jurisdictionId: { type: "string", description: "Registered jurisdiction id." } },
  required: ["jurisdictionId"],
} as const;

const geometryParams = {
  type: "object",
  properties: {
    jurisdictionId: { type: "string", description: "Registered jurisdiction id." },
    revisionId: { type: "string", description: "District revision id." },
  },
  required: ["jurisdictionId", "revisionId"],
} as const;

const geometryResponse = {
  type: "object",
  additionalProperties: true,
  description: "A GeoJSON MultiPolygon (EPSG:4326) — the official boundary of the requested district revision.",
} as const;

export function registerPublicAreaCatalogRoutes(app: FastifyInstance, services: Services): void {
  const svc = services.areaCatalogService;

  app.get(
    "/v1/public/jurisdictions",
    {
      schema: {
        tags: ["public"],
        summary:
          "List registered jurisdictions (id + level + optional public label, per-record-type labels, " +
          "and content caps). No policy fields.",
        response: { 200: jurisdictionsResponse },
      },
    },
    async () => ({ items: svc.listJurisdictions() }),
  );

  app.get(
    "/v1/public/jurisdictions/:jurisdictionId/districts",
    {
      schema: {
        tags: ["public"],
        summary:
          "Effective-dated district directory at asOf (default: today UTC). One revision per riding; " +
          "registered jurisdiction with no ingested boundaries returns an empty list. include=geometry embeds boundaries (heavy).",
        params: jurisdictionParams,
        querystring: districtsQuerystring,
        response: { 200: districtsResponse, 400: errorSchema, 404: errorSchema },
      },
    },
    async (req) => {
      const { jurisdictionId } = req.params as { jurisdictionId: string };
      const q = req.query as { asOf?: string; include?: "geometry" };
      return svc.listDistricts(jurisdictionId, { asOf: q.asOf, includeGeometry: q.include === "geometry" });
    },
  );

  app.get(
    "/v1/public/jurisdictions/:jurisdictionId/districts/:revisionId/geometry",
    {
      schema: {
        tags: ["public"],
        summary:
          "Official GeoJSON MultiPolygon (EPSG:4326) for one district revision by id. Returns ANY ingested " +
          "revision, including superseded redraws not in the current effective set (correct for audit).",
        params: geometryParams,
        response: { 200: geometryResponse, 404: errorSchema },
      },
    },
    async (req) => {
      const { jurisdictionId, revisionId } = req.params as { jurisdictionId: string; revisionId: string };
      return svc.getDistrictGeometry(jurisdictionId, revisionId);
    },
  );
}
