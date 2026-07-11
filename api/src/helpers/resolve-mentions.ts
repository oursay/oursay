// Batch-resolve mention tokens from content strings onto a MentionsMap for read DTOs.
// Short-circuits when no `<@…>` is present (blast radius: non-mention records unchanged).

import type { PrivateStore } from "@oursay/public-record";
import { collectMentionNodeIds } from "@oursay/encode";
import type { MentionsMap, ReadResolution, ThreadGeoContext } from "../services/identity-read.service.js";
import { contentMentionStrings } from "./mentions.js";

/** Resolve mentions from an arbitrary list of strings (title/body paragraphs/etc.). */
export async function resolveMentionsFromStrings(
  store: PrivateStore,
  res: ReadResolution,
  ctx: ThreadGeoContext,
  strings: string[],
): Promise<MentionsMap | undefined> {
  const nodeIds = collectMentionNodeIds(...strings);
  if (nodeIds.length === 0) return undefined;
  const map = await store.getMentionMapByNodeIds(nodeIds);
  const out: MentionsMap = {};
  for (const nodeId of nodeIds) {
    const row = map.get(nodeId);
    if (!row) continue; // unknown token — leave raw in body; omit from metadata
    out[nodeId] = await res.resolveMention(row, ctx);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Resolve mentions from a committed content object (and optional already-split body paras). */
export async function resolveContentMentions(
  store: PrivateStore,
  res: ReadResolution,
  ctx: ThreadGeoContext,
  content: unknown,
  extraStrings: string[] = [],
): Promise<MentionsMap | undefined> {
  return resolveMentionsFromStrings(store, res, ctx, [...contentMentionStrings(content), ...extraStrings]);
}
