// Shared response-schema fragments for the public page routes (persona + profile). These were
// copy-pasted verbatim in public-persona.routes.ts and public-profile.routes.ts; hoisted here so
// the identity + activity shapes have one definition. Mention metadata is shared by feed + detail.

import { ACTIVITY_KINDS } from "../../services/profile-page.service.js";

/** Viewer-resolved author identity (persona display or revealed handle). */
export const identitySchema = {
  type: "object",
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

/** One profile/persona/official activity row. `ts` is an ISO timestamp — the client formats the
 *  relative time (single source: relTime) so it ticks live and matches comment vocabulary. */
export const activityItemSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: [...ACTIVITY_KINDS] },
    icon: { type: "string" },
    text: { type: "string" },
    ts: { type: "string" },
    jurisdictionId: { type: "string" },
    recordId: { type: "string" },
  },
  required: ["kind", "text", "ts", "jurisdictionId"],
} as const;

/** Server-resolved mention display for one opaque token (mention-node.md). */
export const mentionResolvedSchema = {
  type: "object",
  description: "Server-resolved mention display for one opaque token (mention-node.md).",
  properties: {
    display: { type: "string" },
    kind: { type: "string", enum: ["reserved", "persona", "profile"] },
    route: { type: "string", description: "Profile/persona path when linkable; omitted for reserved/Someone." },
    isSelf: { type: "boolean" },
  },
  required: ["display", "kind", "isSelf"],
  additionalProperties: false,
} as const;

/** nodeId → resolved mention metadata. Absent on DTOs when the content has no well-formed tokens. */
export const mentionsMapSchema = {
  type: "object",
  description: "nodeId → resolved mention metadata. Absent when the content has no well-formed tokens.",
  additionalProperties: mentionResolvedSchema,
} as const;
