/**
 * Split a content string into plain text and mention-chip segments for rendering.
 * Missing map entries → display "Someone", non-link.
 */

import { parseMentionTokens } from "@oursay/encode";
import type { MentionsMap, MentionKind } from "@/lib/types";

export type MentionSegment =
  | { type: "text"; value: string }
  | {
      type: "mention";
      nodeId: string;
      display: string;
      kind: MentionKind | "unknown";
      route?: string;
      /** True when a profile/persona route may be linked. */
      linkable: boolean;
    };

export function mentionSegments(
  text: string,
  mentions?: MentionsMap,
  allowLinks = true,
): MentionSegment[] {
  const tokens = parseMentionTokens(text);
  if (tokens.length === 0) return [{ type: "text", value: text }];

  const parts: MentionSegment[] = [];
  let cursor = 0;
  for (const tok of tokens) {
    if (tok.index > cursor) {
      parts.push({ type: "text", value: text.slice(cursor, tok.index) });
    }
    const meta = mentions?.[tok.nodeId];
    const display = meta?.display ?? "Someone";
    const kind = meta?.kind ?? "unknown";
    const route = meta?.route;
    const linkable =
      allowLinks && !!route && kind !== "reserved" && kind !== "unknown";
    parts.push({
      type: "mention",
      nodeId: tok.nodeId,
      display,
      kind,
      ...(route ? { route } : {}),
      linkable,
    });
    cursor = tok.index + tok.token.length;
  }
  if (cursor < text.length) {
    parts.push({ type: "text", value: text.slice(cursor) });
  }
  return parts;
}
