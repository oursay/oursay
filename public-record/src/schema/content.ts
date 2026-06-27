// Per-type content-model + length enforcement, run at create/update by the RecordService (see
// record.ts). The append-only ENGINE is content-agnostic about most shapes (content is JSONB
// "guidance" in types.ts), but a few product rules are enforced here so they can't be bypassed by
// the unsigned dev path, the signed civic path, or prepare-time validation. This mirrors the
// reaction-`kind` check already living in validateCreate. Length caps come from the jurisdiction's
// `contentLimits` (else DEFAULT_CONTENT_LIMITS); see jurisdiction.ts.

import { DEFAULT_CONTENT_LIMITS, getJurisdiction } from "../jurisdiction.js";
import type { Op, RecordType } from "./types.js";

/**
 * Validate a record's content shape + length caps for a create/update. Currently covers `post`
 * (title required ≤cap, body optional ≤cap); other types are out of scope here (reaction `kind`
 * stays validated in validateCreate). A `delete` carries the DELETE_MARKER, so it is skipped.
 * Throws a plain Error with a human-readable message on any violation — callers map it to a 400.
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
  }
}
