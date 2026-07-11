/**
 * Compose-time @mention parse + resolve against an in-thread roster.
 * Every real `@handle` span becomes a prepare candidate; unmatched → display `@Someone`
 * (still sent as a profile candidate with the typed handle so the API allocates unresolved).
 * Emails (`me@email.com`) and empty `@` / `@ 4pm` are ignored.
 *
 * Profiles always resolve/insert as wire **handles** (not display names). Display names are
 * typeahead aliases only — flip `display` to the name later if product wants that.
 */

import type { MentionCandidate } from "@oursay/identity";

const HANDLE_CHAR_RE = /[A-Za-z0-9_-]/;
/** Max wire-handle length — matches web-app/src/lib/handle.ts. */
const HANDLE_MAX = 30;

/** Default typeahead list size. */
export const MENTION_TYPEAHEAD_LIMIT = 6;

export interface MentionRosterEntry {
  /** Stable key (persona name or profile handle). */
  label: string;
  candidate: MentionCandidate;
  /**
   * What gets inserted into compose after resolve — without leading `@`.
   * Personas: persona name. Profiles: wire handle (not display name).
   */
  display: string;
  /**
   * Extra typeahead / resolve match strings (e.g. profile display name).
   * Does not change what is inserted — `display` stays the handle for profiles.
   */
  aliases?: string[];
}

export interface MentionRoster {
  /** In-thread persona names (always relate when selected). */
  personas: MentionRosterEntry[];
  /** Profiles visible to the commenter in this thread. */
  profiles: MentionRosterEntry[];
}

export interface ParsedAtSpan {
  /** Index of `@` in the source string. */
  start: number;
  /** Exclusive end of the handle body. */
  end: number;
  /** Handle body without `@`. */
  raw: string;
}

export interface ComposeMentionPayload {
  /** Content with unresolved spans rewritten to `@Someone`. */
  text: string;
  mentions: MentionCandidate[];
  /** Exact `@…` labels in `text`, parallel to `mentions`. */
  mentionSpans: string[];
}

export type ComposeHighlightSegment =
  | { type: "text"; value: string }
  | { type: "tag"; value: string };

/**
 * Resolve `@` spans across ordered string fields (e.g. title then body).
 * Mentions/spans are concatenated in field order for SDK embed.
 */
export function resolveComposeMentionsFields(
  fields: Record<string, string>,
  fieldOrder: string[],
  roster: MentionRoster,
): { fields: Record<string, string>; mentions: MentionCandidate[]; mentionSpans: string[] } {
  const outFields: Record<string, string> = { ...fields };
  const mentions: MentionCandidate[] = [];
  const mentionSpans: string[] = [];
  for (const key of fieldOrder) {
    const raw = fields[key];
    if (typeof raw !== "string") continue;
    const resolved = resolveComposeMentions(raw, roster);
    outFields[key] = resolved.text;
    mentions.push(...resolved.mentions);
    mentionSpans.push(...resolved.mentionSpans);
  }
  return { fields: outFields, mentions, mentionSpans };
}

/** True when `@` at `index` is a mention start (not email-like). */
export function isMentionAt(text: string, index: number): boolean {
  if (text[index] !== "@") return false;
  if (index > 0 && /[A-Za-z0-9_]/.test(text[index - 1]!)) return false;
  return true;
}

/** Left-to-right `@` spans with a non-empty handle body (emails / empty `@` skipped). */
export function parseAtSpans(text: string): ParsedAtSpan[] {
  const out: ParsedAtSpan[] = [];
  for (let i = 0; i < text.length; i++) {
    if (!isMentionAt(text, i)) continue;
    let j = i + 1;
    while (j < text.length && HANDLE_CHAR_RE.test(text[j]!) && j - i - 1 < HANDLE_MAX) {
      j++;
    }
    if (j === i + 1) continue; // empty @
    out.push({ start: i, end: j, raw: text.slice(i + 1, j) });
  }
  return out;
}

function entryMatchStrings(e: MentionRosterEntry): string[] {
  return [e.label, e.display, ...(e.aliases ?? [])];
}

function entryMatchesRaw(e: MentionRosterEntry, raw: string, lower: string): boolean {
  return entryMatchStrings(e).some((s) => s === raw || s.toLowerCase() === lower);
}

function findRosterMatch(
  raw: string,
  roster: MentionRoster,
): MentionRosterEntry | null {
  const lower = raw.toLowerCase();
  for (const p of roster.personas) {
    if (entryMatchesRaw(p, raw, lower)) return p;
  }
  for (const p of roster.profiles) {
    if (entryMatchesRaw(p, raw, lower)) return p;
  }
  return null;
}

/** Whether this `@raw` span should render as a compose tag (roster hit or Someone). */
export function isComposeTagSpan(raw: string, roster: MentionRoster): boolean {
  if (raw === "Someone") return true;
  return findRosterMatch(raw, roster) != null;
}

/**
 * Split compose text into plain + tag segments for the highlight overlay.
 * Tags are roster-resolved spans and `@Someone` (bold purple in the composer).
 */
export function composeHighlightSegments(
  text: string,
  roster: MentionRoster,
): ComposeHighlightSegment[] {
  const spans = parseAtSpans(text);
  if (spans.length === 0) return [{ type: "text", value: text }];

  const parts: ComposeHighlightSegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      parts.push({ type: "text", value: text.slice(cursor, span.start) });
    }
    const token = text.slice(span.start, span.end);
    if (isComposeTagSpan(span.raw, roster)) {
      // Prefer canonical @display when a roster match rewrites (e.g. alias → handle).
      const match = findRosterMatch(span.raw, roster);
      const value = match ? `@${match.display}` : token;
      // Only mark as tag when the on-screen token already matches what we'd show
      // (avoid styling mid-edit alias text that hasn't been rewritten yet).
      if (token === value || span.raw === "Someone") {
        parts.push({ type: "tag", value: token });
      } else {
        parts.push({ type: "text", value: token });
      }
    } else {
      parts.push({ type: "text", value: token });
    }
    cursor = span.end;
  }
  if (cursor < text.length) {
    parts.push({ type: "text", value: text.slice(cursor) });
  }
  return parts;
}

/**
 * Resolve every `@` span against the roster. Rewrites unmatched spans to `@Someone`.
 * Profile matches always emit `@handle` (even when matched via display-name alias).
 * Returns prepare candidates + exact spans for SDK embed (order = left-to-right).
 */
export function resolveComposeMentions(
  text: string,
  roster: MentionRoster,
): ComposeMentionPayload {
  const spans = parseAtSpans(text);
  if (spans.length === 0) {
    return { text, mentions: [], mentionSpans: [] };
  }

  const mentions: MentionCandidate[] = [];
  const mentionSpans: string[] = [];
  let out = "";
  let cursor = 0;

  for (const span of spans) {
    out += text.slice(cursor, span.start);
    const match = findRosterMatch(span.raw, roster);
    if (match) {
      mentions.push(match.candidate);
      const label = `@${match.display}`;
      mentionSpans.push(label);
      out += label;
    } else {
      // Unresolved: UI shows Someone; still send typed handle so API allocateUnresolved.
      mentions.push({ kind: "profile", handle: span.raw });
      mentionSpans.push("@Someone");
      out += "@Someone";
    }
    cursor = span.end;
  }
  out += text.slice(cursor);
  return { text: out, mentions, mentionSpans };
}

/** Active `@` query at caret for typeahead (null when not in a mention). */
export function activeMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  if (caret < 0 || caret > text.length) return null;
  let i = caret - 1;
  while (i >= 0 && HANDLE_CHAR_RE.test(text[i]!)) i--;
  if (i < 0 || text[i] !== "@") return null;
  if (!isMentionAt(text, i)) return null;
  const query = text.slice(i + 1, caret);
  if (query.length > HANDLE_MAX) return null;
  return { start: i, query };
}

function entryMatchesQuery(e: MentionRosterEntry, q: string): boolean {
  if (!q) return true;
  return entryMatchStrings(e).some((s) => s.toLowerCase().startsWith(q));
}

/**
 * Filter roster entries by handle / persona / display-name alias prefix.
 * Default limit {@link MENTION_TYPEAHEAD_LIMIT}.
 */
export function filterMentionRoster(
  roster: MentionRoster,
  query: string,
  limit = MENTION_TYPEAHEAD_LIMIT,
): MentionRosterEntry[] {
  const q = query.toLowerCase();
  const out: MentionRosterEntry[] = [];
  const push = (entries: MentionRosterEntry[]) => {
    for (const e of entries) {
      if (out.length >= limit) return;
      if (entryMatchesQuery(e, q)) out.push(e);
    }
  };
  push(roster.personas);
  push(roster.profiles);
  return out;
}

/** Replace the active `@query` at caret with a finalized `@display` span (handle for profiles). */
export function applyMentionSelection(
  text: string,
  caret: number,
  entry: MentionRosterEntry,
): { text: string; caret: number } {
  const active = activeMentionQuery(text, caret);
  if (!active) return { text, caret };
  const insert = `@${entry.display} `;
  const next = text.slice(0, active.start) + insert + text.slice(caret);
  return { text: next, caret: active.start + insert.length };
}
