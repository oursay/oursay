/**
 * Compose-time @mention parse + resolve against an in-thread roster.
 * Every real `@handle` span becomes a prepare candidate; unmatched → display `@Someone`
 * (still sent as a profile candidate with the typed handle so the API allocates unresolved).
 * Emails (`me@email.com`) and empty `@` / `@ 4pm` are ignored.
 */

import type { MentionCandidate } from "@oursay/identity";

const HANDLE_CHAR_RE = /[A-Za-z0-9_-]/;
/** Max wire-handle length — matches web-app/src/lib/handle.ts. */
const HANDLE_MAX = 30;

export interface MentionRosterEntry {
  /** Typeahead / match key (persona name or profile handle). */
  label: string;
  candidate: MentionCandidate;
  /** Display after resolve (`Someone` | persona | handle) — without leading @. */
  display: string;
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

function findRosterMatch(
  raw: string,
  roster: MentionRoster,
): MentionRosterEntry | null {
  const lower = raw.toLowerCase();
  for (const p of roster.personas) {
    if (p.label === raw || p.label.toLowerCase() === lower) return p;
  }
  for (const p of roster.profiles) {
    if (p.label === raw || p.label.toLowerCase() === lower) return p;
  }
  return null;
}

/**
 * Resolve every `@` span against the roster. Rewrites unmatched spans to `@Someone`.
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

/** Filter roster entries whose label starts with `query` (case-insensitive). */
export function filterMentionRoster(
  roster: MentionRoster,
  query: string,
  limit = 8,
): MentionRosterEntry[] {
  const q = query.toLowerCase();
  const out: MentionRosterEntry[] = [];
  const push = (entries: MentionRosterEntry[]) => {
    for (const e of entries) {
      if (out.length >= limit) return;
      if (!q || e.label.toLowerCase().startsWith(q) || e.display.toLowerCase().startsWith(q)) {
        out.push(e);
      }
    }
  };
  push(roster.personas);
  push(roster.profiles);
  return out;
}

/** Replace the active `@query` at caret with a finalized `@display` span. */
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
