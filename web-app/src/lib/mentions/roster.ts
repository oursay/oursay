/**
 * Build a compose mention roster from an open thread's root + comment authors.
 * Personas: in-thread persona display names. Profiles: revealed handles only
 * (identity.handle set) — never invent anonymous existence.
 *
 * Profile compose tags always use the wire **handle**. Display names are stored
 * as typeahead aliases so users can find someone by name without inserting it.
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

/**
 * @param handle - wire handle (what compose inserts)
 * @param displayName - optional public display name for typeahead only
 */
function addProfile(
  into: Map<string, MentionRosterEntry>,
  handle: string,
  displayName?: string | null,
) {
  const wire = handle.replace(/^@/, "");
  if (!wire) return;
  const key = wire.toLowerCase();
  const existing = into.get(key);
  const alias =
    displayName && displayName.trim() && displayName.trim() !== wire
      ? displayName.trim()
      : undefined;

  if (existing) {
    if (alias && !(existing.aliases ?? []).includes(alias)) {
      existing.aliases = [...(existing.aliases ?? []), alias];
    }
    return;
  }

  into.set(key, {
    label: wire,
    // Profiles always resolve as handles — switch `display` to the name later if desired.
    display: wire,
    candidate: { kind: "profile", handle: wire },
    ...(alias ? { aliases: [alias] } : {}),
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
    // identity.display is the public name when revealed; handle is what we insert.
    addProfile(profiles, identity.handle, identity.display);
    return;
  }
  // Mock / unresolved identity: treat handle as persona-style if it looks like
  // AdjectiveAnimalNN, else as a visible profile handle when present.
  if (handle && /^[A-Z][A-Za-z]+\d{2,}$/.test(handle)) {
    addPersona(personas, handle);
  } else if (handle) {
    addProfile(profiles, handle, author !== handle ? author : undefined);
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

/** Empty roster — every `@` resolves to Someone client-side. */
export function emptyMentionRoster(): MentionRoster {
  return { personas: [], profiles: [] };
}

/**
 * Roster for new-thread compose (Statement / Petition / Poll). Seeds the
 * signed-in profile so self-`@` typeahead works; there is no in-thread roster
 * yet. Typed handles still tokenize on submit (Someone if unresolved).
 */
export function mentionRosterForNewThread(opts: {
  handle?: string | null;
  displayName?: string | null;
}): MentionRoster {
  const profiles = new Map<string, MentionRosterEntry>();
  const handle = opts.handle?.replace(/^@/, "").trim();
  if (handle) addProfile(profiles, handle, opts.displayName);
  return { personas: [], profiles: [...profiles.values()] };
}
