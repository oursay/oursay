// Per-type content-model + length enforcement, run at create/update by the RecordService (see
// record.ts). The append-only ENGINE is content-agnostic about most shapes (content is JSONB
// "guidance" in types.ts), but a few product rules are enforced here so they can't be bypassed by
// the unsigned dev path, the signed civic path, or prepare-time validation. This mirrors the
// reaction-`kind` check already living in validateCreate. Length caps come from the jurisdiction's
// `contentLimits` (else DEFAULT_CONTENT_LIMITS); see jurisdiction.ts.

import { canonicalJson, sha256Hex } from "../crypto/commitment.js";
import { DEFAULT_CONTENT_LIMITS, getJurisdiction } from "../jurisdiction.js";
import type { Op, PlatformOpsKind, RecordType } from "./types.js";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const GATED_ACTIONS = [
  "post",
  "petition",
  "poll",
  "result",
  "comment",
  "reaction",
  "vote",
  "petition_signature",
] as const;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value;
}

function isoDate(value: unknown, label: string): string {
  const date = nonEmptyString(value, label);
  if (!ISO_DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`);
  }
  return date;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`${label} must be a positive integer`);
  return Number(value);
}

function validateGateActor(value: unknown, label: string): void {
  if (value === "anyone") return;
  const actor = objectValue(value, label);
  const keys = Object.keys(actor);
  if (keys.length !== 1) throw new Error(`${label} must contain exactly one actor selector`);
  if (Array.isArray(actor.tiers) && actor.tiers.length > 0 && actor.tiers.every((v) => typeof v === "string" && v)) return;
  if (actor.residencyIn === "jurisdiction") return;
  if (actor.role === "official") return;
  throw new Error(`${label} is unsupported`);
}

function validateJurisdictionConfig(value: unknown, jurisdictionId: string): void {
  const config = objectValue(value, "jurisdiction_config_set.payload.config");
  if (nonEmptyString(config.id, "jurisdiction config id") !== jurisdictionId) {
    throw new Error("jurisdiction config id must match platform_ops jurisdictionId");
  }
  nonEmptyString(config.level, "jurisdiction config level");
  objectValue(config.rules, "jurisdiction config rules");
  if (config.recognizedAccreditationBodyIds !== undefined) {
    if (
      !Array.isArray(config.recognizedAccreditationBodyIds) ||
      !config.recognizedAccreditationBodyIds.every((id) => typeof id === "string" && id.length > 0)
    ) {
      throw new Error("recognizedAccreditationBodyIds must be an array of non-empty strings");
    }
  }
  if (config.gates !== undefined) {
    const gates = objectValue(config.gates, "jurisdiction config gates");
    for (const action of GATED_ACTIONS) {
      const gate = objectValue(gates[action], `jurisdiction config gates.${action}`);
      validateGateActor(gate.act, `jurisdiction config gates.${action}.act`);
      if (gate.signMin !== "quick" && gate.signMin !== "passkey") {
        throw new Error(`jurisdiction config gates.${action}.signMin is unsupported`);
      }
      if (gate.officialCount !== undefined) {
        validateGateActor(gate.officialCount, `jurisdiction config gates.${action}.officialCount`);
      }
      if (gate.deny !== undefined) {
        if (!Array.isArray(gate.deny)) throw new Error(`jurisdiction config gates.${action}.deny must be an array`);
        gate.deny.forEach((actor, i) => validateGateActor(actor, `jurisdiction config gates.${action}.deny[${i}]`));
      }
    }
  }
}

/** Deep kind-specific validation shared by prepare-time and append-time checks. */
export function validatePlatformOpsPayload(
  kind: PlatformOpsKind,
  jurisdictionId: string,
  value: unknown,
): void {
  nonEmptyString(jurisdictionId, "platform_ops.jurisdictionId");
  const payload = objectValue(value, "platform_ops.payload");
  if (kind === "official_seat_claim") {
    nonEmptyString(payload.seatHandle, "official_seat_claim payload.seatHandle");
    nonEmptyString(payload.userId, "official_seat_claim payload.userId");
    return;
  }
  if (kind === "official_seat_revoke") {
    nonEmptyString(payload.seatHandle, "official_seat_revoke payload.seatHandle");
    if (payload.expectedUserId !== undefined) nonEmptyString(payload.expectedUserId, "expectedUserId");
    if (payload.expectedUserHandle !== undefined) nonEmptyString(payload.expectedUserHandle, "expectedUserHandle");
    return;
  }
  if (kind === "jurisdiction_config_set") {
    validateJurisdictionConfig(payload.config, jurisdictionId);
    return;
  }
  if (kind === "district_upsert") {
    const district = objectValue(payload.district, "district_upsert payload.district");
    nonEmptyString(district.id, "district.id");
    if (nonEmptyString(district.jurisdictionId, "district.jurisdictionId") !== jurisdictionId) {
      throw new Error("district jurisdictionId must match platform_ops jurisdictionId");
    }
    nonEmptyString(district.name, "district.name");
    nonEmptyString(district.districtSlug, "district.districtSlug");
    isoDate(district.effectiveDate, "district.effectiveDate");
    if (district.drawnDate != null) isoDate(district.drawnDate, "district.drawnDate");
    positiveInteger(district.boundaryYear, "district.boundaryYear");
    nonEmptyString(district.source, "district.source");
    positiveInteger(district.srid, "district.srid");
    const geometry = objectValue(district.geometryGeoJSON, "district.geometryGeoJSON");
    if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
      throw new Error("district.geometryGeoJSON must be Polygon or MultiPolygon");
    }
    if (!Array.isArray(geometry.coordinates)) throw new Error("district.geometryGeoJSON.coordinates must be an array");
    const digest = nonEmptyString(district.geometrySha256, "district.geometrySha256");
    if (!SHA256_RE.test(digest) || digest !== sha256Hex(canonicalJson(geometry))) {
      throw new Error("district.geometrySha256 must match the canonical geometry");
    }
    return;
  }
  if (kind === "official_seat_upsert") {
    const seat = objectValue(payload.seat, "official_seat_upsert payload.seat");
    nonEmptyString(seat.id, "seat.id");
    if (nonEmptyString(seat.jurisdictionId, "seat.jurisdictionId") !== jurisdictionId) {
      throw new Error("seat jurisdictionId must match platform_ops jurisdictionId");
    }
    if (seat.seatKind !== "jurisdiction_leader" && seat.seatKind !== "district_mla") {
      throw new Error("seat.seatKind is unsupported");
    }
    nonEmptyString(seat.title, "seat.title");
    nonEmptyString(seat.seatHandle, "seat.seatHandle");
    isoDate(seat.effectiveDate, "seat.effectiveDate");
    positiveInteger(seat.boundaryYear, "seat.boundaryYear");
    nonEmptyString(seat.role, "seat.role");
    nonEmptyString(seat.representativeName, "seat.representativeName");
    nonEmptyString(seat.source, "seat.source");
    return;
  }
  throw new Error(`platform_ops kind is unsupported: ${kind}`);
}

/**
 * Validate a record's content shape + length caps for a create/update. Covers `post` (title required
 * ≤cap, body optional ≤cap), `comment` (body required ≤cap), `petition` (title + text required ≤caps),
 * and `poll` (question required ≤cap; options required non-empty array ≤maxOptions, each a string
 * ≤cap; optional description ≤cap). Other types are out of scope here (reaction `kind` stays validated
 * in validateCreate). A `delete` carries the DELETE_MARKER, so it is skipped. Throws a plain Error with
 * a human-readable message on any violation — callers map it to a 400.
 */
export function validateContent(type: RecordType, op: Op, content: unknown, jurisdictionId?: string): void {
  if (op === "delete") return;
  // TODO(mvp-c10-multi-jurisdiction): thread the action's jurisdiction for per-jurisdiction caps
  // (mirrors requiredSignScheme(type), which also resolves against the deployment default for now).
  const limits =
    type === "platform_ops"
      ? DEFAULT_CONTENT_LIMITS
      : getJurisdiction(jurisdictionId).contentLimits ?? DEFAULT_CONTENT_LIMITS;
  if (type === "post") {
    const caps = limits.post ?? DEFAULT_CONTENT_LIMITS.post!;
    const c = (content ?? {}) as { title?: unknown; body?: unknown };
    if (typeof c.title !== "string" || c.title.trim().length === 0) {
      throw new Error("post.title is required");
    }
    if (caps.title != null && c.title.length > caps.title) {
      throw new Error(`post.title exceeds the ${caps.title}-character limit`);
    }
    if (c.body !== undefined) {
      if (typeof c.body !== "string") throw new Error("post.body must be a string");
      if (caps.body != null && c.body.length > caps.body) {
        throw new Error(`post.body exceeds the ${caps.body}-character limit`);
      }
    }
  } else if (type === "comment") {
    const caps = limits.comment ?? DEFAULT_CONTENT_LIMITS.comment!;
    const c = (content ?? {}) as { body?: unknown };
    if (typeof c.body !== "string" || c.body.trim().length === 0) {
      throw new Error("comment.body is required");
    }
    if (caps.body != null && c.body.length > caps.body) {
      throw new Error(`comment.body exceeds the ${caps.body}-character limit`);
    }
  } else if (type === "petition") {
    const caps = limits.petition ?? DEFAULT_CONTENT_LIMITS.petition!;
    const c = (content ?? {}) as { title?: unknown; text?: unknown };
    if (typeof c.title !== "string" || c.title.trim().length === 0) {
      throw new Error("petition.title is required");
    }
    if (caps.title != null && c.title.length > caps.title) {
      throw new Error(`petition.title exceeds the ${caps.title}-character limit`);
    }
    if (typeof c.text !== "string" || c.text.trim().length === 0) {
      throw new Error("petition.text is required");
    }
    if (caps.text != null && c.text.length > caps.text) {
      throw new Error(`petition.text exceeds the ${caps.text}-character limit`);
    }
  } else if (type === "poll") {
    const caps = limits.poll ?? DEFAULT_CONTENT_LIMITS.poll!;
    const c = (content ?? {}) as { question?: unknown; options?: unknown; description?: unknown };
    if (typeof c.question !== "string" || c.question.trim().length === 0) {
      throw new Error("poll.question is required");
    }
    if (caps.question != null && c.question.length > caps.question) {
      throw new Error(`poll.question exceeds the ${caps.question}-character limit`);
    }
    if (!Array.isArray(c.options) || c.options.length === 0) {
      throw new Error("poll.options must be a non-empty array");
    }
    if (caps.maxOptions != null && c.options.length > caps.maxOptions) {
      throw new Error(`poll.options has more than ${caps.maxOptions} options`);
    }
    c.options.forEach((opt, i) => {
      if (typeof opt !== "string") throw new Error(`poll.options[${i}] must be a string`);
      if (caps.option != null && opt.length > caps.option) {
        throw new Error(`poll.options[${i}] exceeds the ${caps.option}-character limit`);
      }
    });
    if (c.description !== undefined) {
      if (typeof c.description !== "string") throw new Error("poll.description must be a string");
      if (caps.description != null && c.description.length > caps.description) {
        throw new Error(`poll.description exceeds the ${caps.description}-character limit`);
      }
    }
  } else if (type === "result") {
    // A result reuses the post caps (title + body prose); tallies/sourcePollId are structural.
    const caps = limits.post ?? DEFAULT_CONTENT_LIMITS.post!;
    const c = (content ?? {}) as { title?: unknown; body?: unknown; sourcePollId?: unknown; tallies?: unknown };
    if (typeof c.title !== "string" || c.title.trim().length === 0) {
      throw new Error("result.title is required");
    }
    if (caps.title != null && c.title.length > caps.title) {
      throw new Error(`result.title exceeds the ${caps.title}-character limit`);
    }
    if (c.body !== undefined) {
      if (typeof c.body !== "string") throw new Error("result.body must be a string");
      if (caps.body != null && c.body.length > caps.body) {
        throw new Error(`result.body exceeds the ${caps.body}-character limit`);
      }
    }
    if (c.sourcePollId !== undefined && typeof c.sourcePollId !== "string") {
      throw new Error("result.sourcePollId must be a string entity id");
    }
    if (c.tallies !== undefined) {
      if (!Array.isArray(c.tallies)) throw new Error("result.tallies must be an array");
      c.tallies.forEach((t, i) => {
        const row = t as { option?: unknown; count?: unknown };
        if (typeof row?.option !== "string" || typeof row?.count !== "number") {
          throw new Error(`result.tallies[${i}] must be { option: string, count: number }`);
        }
      });
    }
  } else if (type === "platform_ops") {
    const c = (content ?? {}) as {
      ds?: unknown;
      v?: unknown;
      kind?: unknown;
      jurisdictionId?: unknown;
      payload?: unknown;
      adminAttestation?: unknown;
      request?: unknown;
    };
    if (c.ds !== "oursay/v1/platform-ops") throw new Error("platform_ops.ds must be oursay/v1/platform-ops");
    if (c.v !== 1) throw new Error("platform_ops.v must be 1");
    if (
      c.kind !== "official_seat_claim" &&
      c.kind !== "official_seat_revoke" &&
      c.kind !== "jurisdiction_config_set" &&
      c.kind !== "district_upsert" &&
      c.kind !== "official_seat_upsert"
    ) {
      throw new Error("platform_ops.kind is unsupported");
    }
    if (typeof c.jurisdictionId !== "string" || !c.jurisdictionId) {
      throw new Error("platform_ops.jurisdictionId is required");
    }
    if (!c.payload || typeof c.payload !== "object" || Array.isArray(c.payload)) {
      throw new Error("platform_ops.payload must be an object");
    }
    if (!c.adminAttestation || typeof c.adminAttestation !== "object") {
      throw new Error("platform_ops.adminAttestation is required");
    }
    if (!c.request || typeof c.request !== "object") {
      throw new Error("platform_ops.request is required");
    }
    validatePlatformOpsPayload(
      c.kind as PlatformOpsKind,
      c.jurisdictionId,
      c.payload,
    );
  }
}
