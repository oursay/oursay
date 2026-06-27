// Per-type content-model + length enforcement, run at create/update by the RecordService (see
// record.ts). The append-only ENGINE is content-agnostic about most shapes (content is JSONB
// "guidance" in types.ts), but a few product rules are enforced here so they can't be bypassed by
// the unsigned dev path, the signed civic path, or prepare-time validation. This mirrors the
// reaction-`kind` check already living in validateCreate. Length caps come from the jurisdiction's
// `contentLimits` (else DEFAULT_CONTENT_LIMITS); see jurisdiction.ts.

import { DEFAULT_CONTENT_LIMITS, getJurisdiction } from "../jurisdiction.js";
import type { Op, RecordType } from "./types.js";

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
  const limits = getJurisdiction(jurisdictionId).contentLimits ?? DEFAULT_CONTENT_LIMITS;
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
  }
}
