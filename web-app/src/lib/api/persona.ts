import { DETAIL_BY_ID } from "@/lib/mock";
import type {
  CommentNode,
  RecordKind,
  VerificationTier,
  ViewerContext,
} from "@/lib/types";
import { ANON_VIEWER } from "@/lib/types";
import { personaMapForThread, resolveAuthorIdentity } from "./identity";

/** One action by a persona within its thread. */
export interface PersonaActivityItem {
  kind: "post" | "comment";
  body: string[];
  ts?: string;
  up: number;
  down: number;
}

/** The per-thread persona surface — never exposes the real handle. */
export interface PersonaActivity {
  personaName: string;
  threadId: string;
  threadKind: RecordKind;
  threadTitle: string;
  /** Verification tier stays visible (civic signal, not identity). */
  tier: VerificationTier;
  items: PersonaActivityItem[];
}

function collectByHandle(
  nodes: CommentNode[],
  handle: string,
  into: PersonaActivityItem[],
): void {
  for (const node of nodes) {
    if (node.handle === handle) {
      into.push({
        kind: "comment",
        body: node.body,
        ts: node.ts,
        up: node.up,
        down: node.down,
      });
    }
    collectByHandle(node.replies, handle, into);
  }
}

/**
 * Resolve a persona's activity within one thread. Unknown threads, unknown
 * persona names, and real handles passed as names all resolve null — the
 * caller renders the same not-found state (hide existence, docs/09 §3).
 * If the viewer can actually see through this persona (it's their own, or the
 * author is revealed to them elsewhere), this surface still only shows the
 * persona: the link persona → profile never exists here.
 */
export async function getPersonaActivity(
  threadId: string,
  personaName: string,
  viewer: ViewerContext = ANON_VIEWER,
): Promise<PersonaActivity | null> {
  const entry = DETAIL_BY_ID[threadId];
  if (!entry) return null;

  const map = personaMapForThread(threadId);
  const handle = [...map.entries()].find(([, name]) => name === personaName)?.[0];
  if (!handle) return null;

  // Only surface the persona page for authors actually anonymized to this
  // viewer on this thread; a revealed author's activity lives on their profile.
  const identity = resolveAuthorIdentity(handle, handle, threadId, viewer);

  const items: PersonaActivityItem[] = [];
  let tier: VerificationTier = 0;
  if (entry.post.handle === handle) {
    tier = entry.post.tier;
    items.push({
      kind: "post",
      body: [entry.post.title, ...entry.post.body],
      ts: entry.post.ts,
      up: entry.post.up ?? 0,
      down: entry.post.down ?? 0,
    });
  }
  const comments: PersonaActivityItem[] = [];
  collectByHandle(entry.comments, handle, comments);
  items.push(...comments);
  if (tier === 0) {
    // Tier from the first comment (all a handle's nodes share their tier).
    const findTier = (nodes: CommentNode[]): VerificationTier | null => {
      for (const node of nodes) {
        if (node.handle === handle) return node.tier;
        const nested = findTier(node.replies);
        if (nested !== null) return nested;
      }
      return null;
    };
    tier = findTier(entry.comments) ?? 0;
  }

  if (items.length === 0) return null;

  return {
    personaName: identity.isPersona ? identity.display : personaName,
    threadId,
    threadKind: entry.post.kind,
    threadTitle: entry.post.title,
    tier,
    items,
  };
}
