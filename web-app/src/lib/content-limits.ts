import {
  DEFAULT_CONTENT_LIMITS,
  type JurisdictionContentLimits,
} from "@oursay/content-limits";

/** Progressive counter visibility / emphasis. */
export type CharLimitTone = "hidden" | "muted" | "near" | "over";

/** Resolved numeric caps used by composers (always present after merge with defaults). */
export interface ResolvedContentLimits {
  post: { title: number; body: number };
  comment: { body: number };
  petition: { title: number; text: number };
  poll: {
    question: number;
    option: number;
    maxOptions: number;
    description: number;
  };
}

/**
 * Merge catalog caps with {@link DEFAULT_CONTENT_LIMITS} (same field-level
 * fallback as API `validateContent`).
 */
export function resolveContentLimits(
  overrides?: JurisdictionContentLimits | null,
): ResolvedContentLimits {
  const d = DEFAULT_CONTENT_LIMITS;
  return {
    post: {
      title: overrides?.post?.title ?? d.post!.title!,
      body: overrides?.post?.body ?? d.post!.body!,
    },
    comment: {
      body: overrides?.comment?.body ?? d.comment!.body!,
    },
    petition: {
      title: overrides?.petition?.title ?? d.petition!.title!,
      text: overrides?.petition?.text ?? d.petition!.text!,
    },
    poll: {
      question: overrides?.poll?.question ?? d.poll!.question!,
      option: overrides?.poll?.option ?? d.poll!.option!,
      maxOptions: overrides?.poll?.maxOptions ?? d.poll!.maxOptions!,
      description: overrides?.poll?.description ?? d.poll!.description!,
    },
  };
}

/** Counter tone: hidden until ~80%; near = last ~5% (max red); over = paste past max. */
export function charLimitTone(length: number, max: number): CharLimitTone {
  if (max <= 0) return "hidden";
  if (length > max) return "over";
  if (length >= Math.ceil(0.95 * max)) return "near";
  if (length >= Math.ceil(0.8 * max)) return "muted";
  return "hidden";
}

/**
 * Soft clamp for controlled plain inputs: block single-char typing past `max`,
 * allow paste/drop (multi-char growth) and deletions even when over.
 */
export function clampTypedValue(prev: string, next: string, max: number): string {
  if (next.length <= max) return next;
  if (next.length < prev.length) return next;
  const grewBy = next.length - prev.length;
  if (grewBy > 1) return next;
  return prev;
}

/** True when any of the given lengths exceed their paired max. */
export function anyFieldOverLimit(
  fields: Array<{ length: number; max: number }>,
): boolean {
  return fields.some((f) => f.length > f.max);
}
