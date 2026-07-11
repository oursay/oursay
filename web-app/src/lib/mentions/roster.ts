/**
 * Build a compose mention roster from an open thread's root + comment authors.
 * Personas: in-thread persona display names. Profiles: revealed handles only
 * (identity.handle set) — never invent anonymous existence.
 */

import type { CommentNode, RecordDetail } from "@/lib/types";
import type { MentionRoster, MentionRosterEntry } from "./compose";

function addPersona(into: Map<string, MentionRosterEntry>, name: string) {
  const key = name.toLowerCase();
  if (into.has(key)) return;
  into.set(key, {
    label: name,
    display: name,
    candidate: { kind: "persona", personaName: name },
  });
}

function addProfile(into: Map<string, MentionRosterEntry>, handle: string) {
  const wire = handle.replace(/^@/, "");
  if (!wire) return;
  const key = wire.toLowerCase();
  if (into.has(key)) return;
  into.set(key, {
    label: wire,
    display: wire,
    candidate: { kind: "profile", handle: wire },
  });
}

function collectFromAuthor(
  personas: Map<string, MentionRosterEntry>,
  profiles: Map<string, MentionRosterEntry>,
  author: string,
  handle: string,
  identity?: CommentNode["identity"],
) {
  if (identity?.isPersona) {
    addPersona(personas, identity.display || author || handle);
    return;
  }
  if (identity?.handle) {
    addProfile(profiles, identity.handle);
    return;
  }
  // Mock / unresolved identity: treat handle as persona-style if it looks like
  // AdjectiveAnimalNN, else as a visible profile handle when present.
  if (handle && /^[A-Z][A-Za-z]+\d{2,}$/.test(handle)) {
    addPersona(personas, handle);
  } else if (handle) {
    addProfile(profiles, handle);
  }
}

function walkComments(
  nodes: CommentNode[],
  personas: Map<string, MentionRosterEntry>,
  profiles: Map<string, MentionRosterEntry>,
) {
  for (const node of nodes) {
    collectFromAuthor(personas, profiles, node.author, node.handle, node.identity);
    if (node.replies.length) walkComments(node.replies, personas, profiles);
  }
}

/** Roster for reply compose in an open post thread. */
export function mentionRosterFromThread(
  detail: Pick<RecordDetail, "author" | "handle" | "identity">,
  comments: CommentNode[],
): MentionRoster {
  const personas = new Map<string, MentionRosterEntry>();
  const profiles = new Map<string, MentionRosterEntry>();
  collectFromAuthor(personas, profiles, detail.author, detail.handle, detail.identity);
  walkComments(comments, personas, profiles);
  return {
    personas: [...personas.values()],
    profiles: [...profiles.values()],
  };
}

/** Empty roster (new-thread compose) — every `@` resolves to Someone client-side. */
export function emptyMentionRoster(): MentionRoster {
  return { personas: [], profiles: [] };
}
