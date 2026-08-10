/**
 * Browser localStorage drafts for compose posts and comment/reply composers.
 *
 * Keys:
 * - Post: jurisdiction id + record type
 * - Comment/reply: thread id + parent id
 *
 * Cap: 50 drafts total; saving past the cap drops the oldest by updatedAt.
 */

import type { AuthorVisibility, RecordKind } from "@/lib/types";

export const CONTENT_DRAFTS_STORAGE_KEY = "oursay.contentDrafts";
export const CONTENT_DRAFTS_MAX = 50;

export type PostDraftPayload = {
  title: string;
  body: string;
  pollOptions: string[];
  districts: string[];
  visibility?: AuthorVisibility;
};

export type CommentDraftPayload = {
  text: string;
};

type PostDraftEntry = {
  kind: "post";
  key: string;
  updatedAt: number;
  jurisdictionId: string;
  recordType: RecordKind;
  payload: PostDraftPayload;
};

type CommentDraftEntry = {
  kind: "comment";
  key: string;
  updatedAt: number;
  threadId: string;
  parentId: string;
  payload: CommentDraftPayload;
};

export type ContentDraftEntry = PostDraftEntry | CommentDraftEntry;

function postKey(jurisdictionId: string, recordType: RecordKind): string {
  return `post:${jurisdictionId}:${recordType}`;
}

function commentKey(threadId: string, parentId: string): string {
  return `comment:${threadId}:${parentId}`;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): ContentDraftEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(CONTENT_DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDraftEntry);
  } catch {
    return [];
  }
}

function writeAll(entries: ContentDraftEntry[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(
      CONTENT_DRAFTS_STORAGE_KEY,
      JSON.stringify(entries),
    );
  } catch {
    // private mode / quota — ignore
  }
}

function isDraftEntry(value: unknown): value is ContentDraftEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.key !== "string" || typeof v.updatedAt !== "number") return false;
  if (v.kind === "post") {
    return (
      typeof v.jurisdictionId === "string" &&
      typeof v.recordType === "string" &&
      isPostPayload(v.payload)
    );
  }
  if (v.kind === "comment") {
    return (
      typeof v.threadId === "string" &&
      typeof v.parentId === "string" &&
      isCommentPayload(v.payload)
    );
  }
  return false;
}

function isPostPayload(value: unknown): value is PostDraftPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === "string" &&
    typeof v.body === "string" &&
    Array.isArray(v.pollOptions) &&
    v.pollOptions.every((o) => typeof o === "string") &&
    Array.isArray(v.districts) &&
    v.districts.every((d) => typeof d === "string")
  );
}

function isCommentPayload(value: unknown): value is CommentDraftPayload {
  if (!value || typeof value !== "object") return false;
  return typeof (value as CommentDraftPayload).text === "string";
}

function isPostDraftEmpty(payload: PostDraftPayload): boolean {
  const optionsEmpty = payload.pollOptions.every((o) => !o.trim());
  return (
    !payload.title.trim() &&
    !payload.body.trim() &&
    optionsEmpty &&
    payload.districts.length === 0 &&
    payload.visibility === undefined
  );
}

function isCommentDraftEmpty(payload: CommentDraftPayload): boolean {
  return !payload.text.trim();
}

/** Upsert by key; drop oldest when over max. Empty payload removes the entry. */
function upsert(
  entry: ContentDraftEntry | null,
  key: string,
  empty: boolean,
): void {
  const next = readAll().filter((e) => e.key !== key);
  if (!empty && entry) next.push(entry);
  next.sort((a, b) => a.updatedAt - b.updatedAt);
  while (next.length > CONTENT_DRAFTS_MAX) next.shift();
  writeAll(next);
}

export function savePostDraft(
  jurisdictionId: string,
  recordType: RecordKind,
  payload: PostDraftPayload,
  now = Date.now(),
): void {
  const key = postKey(jurisdictionId, recordType);
  if (isPostDraftEmpty(payload)) {
    upsert(null, key, true);
    return;
  }
  upsert(
    {
      kind: "post",
      key,
      updatedAt: now,
      jurisdictionId,
      recordType,
      payload: {
        title: payload.title,
        body: payload.body,
        pollOptions: [...payload.pollOptions],
        districts: [...payload.districts],
        visibility: payload.visibility,
      },
    },
    key,
    false,
  );
}

export function loadPostDraft(
  jurisdictionId: string,
  recordType: RecordKind,
): PostDraftPayload | null {
  const key = postKey(jurisdictionId, recordType);
  const entry = readAll().find((e) => e.key === key);
  if (!entry || entry.kind !== "post") return null;
  return {
    title: entry.payload.title,
    body: entry.payload.body,
    pollOptions: [...entry.payload.pollOptions],
    districts: [...entry.payload.districts],
    visibility: entry.payload.visibility,
  };
}

export function clearPostDraft(
  jurisdictionId: string,
  recordType: RecordKind,
): void {
  upsert(null, postKey(jurisdictionId, recordType), true);
}

export function saveCommentDraft(
  threadId: string,
  parentId: string,
  payload: CommentDraftPayload,
  now = Date.now(),
): void {
  const key = commentKey(threadId, parentId);
  if (isCommentDraftEmpty(payload)) {
    upsert(null, key, true);
    return;
  }
  upsert(
    {
      kind: "comment",
      key,
      updatedAt: now,
      threadId,
      parentId,
      payload: { text: payload.text },
    },
    key,
    false,
  );
}

export function loadCommentDraft(
  threadId: string,
  parentId: string,
): CommentDraftPayload | null {
  const key = commentKey(threadId, parentId);
  const entry = readAll().find((e) => e.key === key);
  if (!entry || entry.kind !== "comment") return null;
  return { text: entry.payload.text };
}

export function clearCommentDraft(threadId: string, parentId: string): void {
  upsert(null, commentKey(threadId, parentId), true);
}

/** Test helper — returns stored entries newest-last (by updatedAt). */
export function listContentDrafts(): ContentDraftEntry[] {
  return readAll().slice().sort((a, b) => a.updatedAt - b.updatedAt);
}
