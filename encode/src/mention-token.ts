// Opaque mention tokens embedded in committed civic string fields
// (`docs/entities/civic-identity/mention-node.md`):
//   `<@` + encodeUuidV4Base59(nodeId) + `>`
// Well-formed tokens are the only mention syntax recognized at read/index time.

import { decodeUuidV4Base59, encodeUuidV4Base59, isUuidV4 } from "./uuid-base59.js";

/** Matches a single well-formed mention token; capture group 1 is the Base59 payload. */
export const MENTION_TOKEN_RE = /<@([0-9A-Za-z_]+)>/g;

/** Build the canonical committed token for a mention node id (UUID v4). */
export function buildMentionToken(nodeId: string): string {
  if (!isUuidV4(nodeId)) throw new Error("expected a UUID v4 node id");
  return `<@${encodeUuidV4Base59(nodeId)}>`;
}

export interface ParsedMentionToken {
  /** Canonical lowercase UUID v4. */
  nodeId: string;
  /** Full token substring including `<@` … `>`. */
  token: string;
  /** Start index of `token` in the source string. */
  index: number;
}

/**
 * Parse well-formed mention tokens from a string. Malformed `<@…>` spans are ignored
 * (plain `@handle` text is never a token). Order is left-to-right; duplicates are kept.
 */
export function parseMentionTokens(text: string): ParsedMentionToken[] {
  if (!text.includes("<@")) return [];
  const out: ParsedMentionToken[] = [];
  const re = new RegExp(MENTION_TOKEN_RE.source, "g");
  for (const match of text.matchAll(re)) {
    const payload = match[1];
    if (payload == null || match.index == null) continue;
    try {
      const nodeId = decodeUuidV4Base59(payload);
      out.push({ nodeId, token: match[0], index: match.index });
    } catch {
      /* ignore undecodable payloads */
    }
  }
  return out;
}

/** Unique node ids from one or more strings (order of first appearance). */
export function collectMentionNodeIds(...texts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of texts) {
    for (const { nodeId } of parseMentionTokens(text)) {
      if (seen.has(nodeId)) continue;
      seen.add(nodeId);
      out.push(nodeId);
    }
  }
  return out;
}
