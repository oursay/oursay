import type { AuthorIdentity, RecordKind } from "@/lib/types";
import { DETAIL_BY_ID } from "@/lib/mock";
import { COMMENTS_SECTION_ID } from "./scroll";

/** The civic views (five wireframe views + the per-thread persona surface). */
export type AppView =
  | "feed"
  | "jurisdiction"
  | "district"
  | "profile"
  | "post"
  | "persona";

export const RECORD_KINDS: RecordKind[] = ["statement", "petition", "poll", "result"];

const RECORD_KIND_LABEL: Record<RecordKind, string> = {
  statement: "Statement",
  petition: "Petition",
  poll: "Poll",
  result: "Result",
};

/** "Alberta" -> "alberta"; the inverse of jurisdictionNameFromSlug for our set. */
export function jurisdictionSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

/** "alberta" -> "Alberta". Title-cases each hyphen segment (Global / Alberta). */
export function jurisdictionNameFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function jurisdictionPath(name: string): string {
  return `/jurisdiction/${jurisdictionSlug(name)}`;
}

export function districtPath(slug: string): string {
  return `/district/${slug}`;
}

export function profilePath(handle: string): string {
  return `/profile/${handle}`;
}

/**
 * Per-thread persona profile (anonymous author within one thread). Persona
 * names are globally unique, so the name alone addresses the page — the
 * thread never leaks into the URL (in prod it would be an opaque id anyway).
 */
export function personaPath(personaName: string): string {
  return `/persona/${encodeURIComponent(personaName)}`;
}

/**
 * Where an author tap lands: personas go to their persona profile (never the
 * real profile); revealed authors go to their profile.
 */
export function authorPath(
  identity: AuthorIdentity | undefined,
  fallbackHandle: string,
): string {
  if (identity?.isPersona) {
    return personaPath(identity.display);
  }
  return profilePath(identity?.handle ?? fallbackHandle);
}

/** The signed-in account's own public profile (static segment beats [handle]). */
export const SELF_PROFILE_PATH = "/profile/self";

/** Route to a record detail page: /{kind}/{id}. */
export function postPath(
  kind: RecordKind,
  id: string,
  opts?: { comments?: boolean },
): string {
  const base = `/${kind}/${id}`;
  return opts?.comments ? `${base}#${COMMENTS_SECTION_ID}` : base;
}

/** Route when only the record id is known (resolves kind from mock corpus). */
export function postPathForId(
  id: string,
  opts?: { comments?: boolean },
): string {
  const kind = DETAIL_BY_ID[id]?.post.kind ?? "statement";
  return postPath(kind, id, opts);
}

/** Derive the active view from the pathname (drives shared chrome in AppShell). */
export function viewFromPathname(pathname: string): AppView {
  if (pathname.startsWith("/jurisdiction")) return "jurisdiction";
  if (pathname.startsWith("/district")) return "district";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/persona")) return "persona";
  if (RECORD_KINDS.some((kind) => pathname.startsWith(`/${kind}/`))) return "post";
  return "feed";
}

/** Browser tab title — kind-specific on record routes. */
export function pageTitle(pathname: string): string {
  for (const kind of RECORD_KINDS) {
    if (pathname.startsWith(`/${kind}/`)) return RECORD_KIND_LABEL[kind];
  }
  return VIEW_TITLE[viewFromPathname(pathname)];
}

/** Fixed header title per view (browser tab only — not shown in app chrome). */
export const VIEW_TITLE: Record<AppView, string> = {
  feed: "Feed",
  jurisdiction: "Jurisdiction",
  district: "District",
  profile: "Profile",
  post: "Post",
  persona: "Anonymous",
};

/** Label for the header jurisdiction pill on feed-like views (wireframe pillLabel). */
export function jurisdictionPillLabel(
  included: string[],
  total: number,
): string {
  if (included.length === 0) return "None";
  if (included.length === 1) return included[0];
  if (included.length === total) return "All Jurisdictions";
  return `${included.length} Jurisdictions`;
}
