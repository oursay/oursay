// Embed opaque mention tokens into intent content string fields before
// contentCommitment / sign (docs/entities/civic-identity/mention-node.md).
// Compose keeps `@handle` / `@persona` / `@Someone` spans; prepare returns
// mentionNodes in the same order; this helper replaces those spans with
// `<@base59(nodeId)>` left-to-right across title/body/text/question/description.

import { buildMentionToken } from "@oursay/encode";
import type { MentionCandidate, MentionNodeRef } from "../shared/types.js";

export const MENTION_STRING_KEYS = ["title", "body", "text", "question", "description"] as const;

/** Derive the exact `@…` compose span for a candidate when the caller does not pass spans. */
export function composeSpanForCandidate(c: MentionCandidate): string {
  if (c.kind === "persona") return `@${c.personaName}`;
  if (c.handle) return `@${c.handle}`;
  throw new Error("embedMentions: profile candidate needs a handle (or pass mentionSpans)");
}

/**
 * Replace ordered compose `@…` spans with mention tokens in content string fields.
 * Spans are matched left-to-right across fields in canonical key order.
 */
export function embedMentionTokens(
  content: unknown,
  mentionNodes: MentionNodeRef[],
  spans: string[],
): unknown {
  if (mentionNodes.length === 0) return content;
  if (mentionNodes.length !== spans.length) {
    throw new Error(
      `embedMentions: mentionNodes (${mentionNodes.length}) and spans (${spans.length}) length mismatch`,
    );
  }
  if (!content || typeof content !== "object") return content;

  const tokens = mentionNodes.map((n) => buildMentionToken(n.nodeId));
  const out: Record<string, unknown> = { ...(content as Record<string, unknown>) };
  let spanIdx = 0;

  for (const key of MENTION_STRING_KEYS) {
    if (spanIdx >= spans.length) break;
    const v = out[key];
    if (typeof v !== "string" || v.length === 0) continue;
    const replaced = replaceSpansInOrder(v, spans, tokens, spanIdx);
    out[key] = replaced.text;
    spanIdx = replaced.nextIdx;
  }

  if (spanIdx < spans.length) {
    throw new Error(
      `embedMentions: could not find compose span ${JSON.stringify(spans[spanIdx])} in content fields`,
    );
  }
  return out;
}

function replaceSpansInOrder(
  text: string,
  spans: string[],
  tokens: string[],
  startIdx: number,
): { text: string; nextIdx: number } {
  let i = startIdx;
  let out = text;
  let searchFrom = 0;
  while (i < spans.length) {
    const span = spans[i]!;
    const at = out.indexOf(span, searchFrom);
    if (at < 0) break;
    const token = tokens[i]!;
    out = out.slice(0, at) + token + out.slice(at + span.length);
    searchFrom = at + token.length;
    i++;
  }
  return { text: out, nextIdx: i };
}
