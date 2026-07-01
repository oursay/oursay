import type { RecordKind } from "@/lib/types";

/** The five civic views, mirroring the wireframe's VIEW_ORDER. */
export type AppView = "feed" | "jurisdiction" | "district" | "profile" | "post";

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

// TODO(entityId): these route by record kind to the one representative sample per
// type. Production swaps `[kind]` for `[id]` so a card opens its own record.
export function postPath(kind: RecordKind): string {
  return `/post/${kind}`;
}

/** Derive the active view from the pathname (drives shared chrome in AppShell). */
export function viewFromPathname(pathname: string): AppView {
  if (pathname.startsWith("/jurisdiction")) return "jurisdiction";
  if (pathname.startsWith("/district")) return "district";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/post")) return "post";
  return "feed";
}

/** Fixed header title per view (the jurisdiction/district name shows in the pill). */
export const VIEW_TITLE: Record<AppView, string> = {
  feed: "Feed",
  jurisdiction: "Jurisdiction",
  district: "District",
  profile: "Profile",
  post: "Post",
};
