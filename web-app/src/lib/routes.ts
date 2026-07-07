import type { AuthorIdentity, RecordKind } from "@/lib/types";
import { DETAIL_BY_ID, DISTRICT_BY_SLUG, jurisdictionById } from "@/lib/mock";
import { wireHandle } from "@/lib/handle";
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

/** Jurisdiction id -> URL slug (e.g. "ab-ca-gov" -> "alberta"; fallback = the id). */
export function jurisdictionSlug(jurisdictionId: string): string {
  return jurisdictionById(jurisdictionId)?.slug ?? jurisdictionId;
}

/** Route to a jurisdiction view by id: /jurisdiction/{slug}. */
export function jurisdictionPath(jurisdictionId: string): string {
  return `/jurisdiction/${jurisdictionSlug(jurisdictionId)}`;
}

/**
 * Route to a district by its slug — nested under the parent jurisdiction to
 * avoid cross-jurisdiction slug collisions (Part 6 #12):
 * `/jurisdiction/{jurSlug}/district/{districtSlug}`. The parent jurisdiction is
 * resolved from the district registry, so callers pass only the district slug.
 */
export function districtPath(districtSlug: string): string {
  const jurId = DISTRICT_BY_SLUG[districtSlug]?.jur;
  const jurSlug = jurId ? jurisdictionSlug(jurId) : "";
  return `/jurisdiction/${jurSlug}/district/${districtSlug}`;
}

/** Public profile URL — wire handle only (no leading @). */
export function profilePath(handle: string): string {
  const wire = wireHandle(handle) ?? handle.replace(/^@/, "");
  return `/profile/${encodeURIComponent(wire)}`;
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

/** Persona page for the self "others see you as …" hint; null when not shown. */
export function personaHintPath(identity: AuthorIdentity | undefined): string | null {
  if (!identity?.seenByOthersAs) return null;
  return personaPath(identity.seenByOthersAs);
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
  // District nests under jurisdiction (/jurisdiction/{slug}/district/{dslug}),
  // so match the district segment BEFORE the jurisdiction prefix.
  if (pathname.includes("/district/")) return "district";
  if (pathname.startsWith("/jurisdiction")) return "jurisdiction";
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
