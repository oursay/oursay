// Helpers for opaque mention tokens in civic content string fields
// (docs/entities/civic-identity/mention-node.md). Tokens live in title/body/text/question
// (and poll description when present); plain @handle text is ignored.

import { collectMentionNodeIds } from "@oursay/encode";

const MENTION_STRING_KEYS = ["title", "body", "text", "question", "description"] as const;

/** Pull mention-bearing string fields from a committed content object. */
export function contentMentionStrings(content: unknown): string[] {
  if (!content || typeof content !== "object") return [];
  const c = content as Record<string, unknown>;
  const out: string[] = [];
  for (const key of MENTION_STRING_KEYS) {
    const v = c[key];
    if (typeof v === "string" && v.length > 0) out.push(v);
  }
  return out;
}

/** Unique mention node ids across content string fields (empty when no tokens). */
export function contentMentionNodeIds(content: unknown): string[] {
  return collectMentionNodeIds(...contentMentionStrings(content));
}
