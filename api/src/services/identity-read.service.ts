// IdentityReadService ([align-w4-api-surface]): viewer-dependent AUTHOR resolution for every
// public read DTO — the server-side port of the web-app's read-path enforcement
// (web-app/src/lib/api/identity.ts + read-model/{visibility,geography}.ts, docs/09):
//
//   - identity: real name/handle iff the author's EFFECTIVE visibility (thread ?? account ??
//     anonymous — a thread override wins outright in either direction, C4) admits this viewer;
//     the per-thread persona (thread_keys.persona_name) otherwise. Self always reveals to self,
//     with a "seenByOthersAs" persona hint when their own effective visibility is not public.
//   - authorGeo: the narrowest viewer-relative spatial relation (home > affected > jurisdiction >
//     none, C6) — resolved from the author's CURRENT residence (the documented interim; action-time
//     snapshots bind later). Raw districts NEVER leave this layer; DTOs carry only the relation.
//
// Everything viewer- or author-private resolves through per-REQUEST memos (a ReadResolution): one
// feed page tests each distinct author once, and nothing memoized outlives the request.

import type { GeoStore } from "@oursay/geo";
import { personaNameForPubkey, type JurisdictionConfig, type PrivateStore } from "@oursay/public-record";
import type { KycRepo } from "../repo/kyc.repo.js";
import type { MembershipRepo } from "../repo/membership.repo.js";
import type { ProfileRepo } from "../repo/profile.repo.js";
import type { UserRepo } from "../repo/user.repo.js";
import { displayNameFor } from "../helpers/handle.js";
import { normalizeTier, type KycTier } from "../types/kyc.js";
import { normalizeVisibility, type AuthorVisibility } from "../types/visibility.js";
import type { ParticipantGeoService } from "./participant-geo.service.js";
import type { ApiViewer } from "./viewer-context.service.js";

/** Wire handle for public DTOs (DB stores `@username`; URLs and UI add the @ at display time). */
function wireHandle(raw: string | null | undefined): string {
  if (!raw) return "unknown";
  return raw.trim().replace(/^@/, "") || "unknown";
}

/** The viewer-resolved author identity attached to served DTOs (mirror of the web-app's
 *  AuthorIdentity — web-app/src/lib/types/identity.ts). `handle` is null for personas: never leaked. */
export interface AuthorIdentityDto {
  display: string;
  handle: string | null;
  isPersona: boolean;
  isSelf: boolean;
  seed: string;
  threadId: string;
  seenByOthersAs?: string;
}

/** C6 relation enum (mirror of the web-app's AuthorGeoRelation). */
export type AuthorGeoRelation = "none" | "home" | "affected" | "jurisdiction";
export const AUTHOR_GEO_RELATIONS: AuthorGeoRelation[] = ["none", "home", "affected", "jurisdiction"];

/** Everything a served DTO carries about an author. `author`/`handle` are the anonymized top-level
 *  fields (author = display; handle falls back to the persona name), matching the mock's
 *  anonymizeFeedItem output so the W5 adapter is a pass-through. */
export interface ResolvedAuthor {
  author: string;
  handle: string;
  identity: AuthorIdentityDto;
  authorGeo: AuthorGeoRelation;
  /** The author's CURRENT canonical KYC tier (numeric mapping is the client's). */
  tier: KycTier;
  /** Platform-assigned official role in the thread's jurisdiction (role, never a tier). */
  official: boolean;
}

/** The record-side inputs for one thread's resolution. */
export interface ThreadGeoContext {
  /** The thread root's entity id (the persona scope). */
  threadId: string;
  /** The thread's audience jurisdiction id. */
  jurisdiction: string;
  /** The root's affected seat slugs ([] ⇒ jurisdiction-wide). */
  affectedDistricts: string[];
}

interface AuthorLink {
  userId: string;
  personaName: string;
}

interface AuthorFacts {
  handle: string;
  displayName: string;
  accountVisibility: AuthorVisibility;
  tier: KycTier;
  /** Jurisdiction ids where the author holds the official role. */
  officialIn: Set<string>;
  /** Home seat slugs (officials: represented seat for that jurisdiction — Part 6 #5). */
  homeDistricts: string[];
}

export interface IdentityReadServiceDeps {
  recordStore: PrivateStore;
  userRepo: UserRepo;
  profileRepo: ProfileRepo;
  kycRepo: KycRepo;
  membershipRepo: MembershipRepo;
  participantGeoService: ParticipantGeoService;
  geoStore: GeoStore;
  jurisdictions: JurisdictionConfig[];
}

export class IdentityReadService {
  constructor(private readonly d: IdentityReadServiceDeps) {}

  /** Start a per-request resolution scope (all memos live and die with it). */
  begin(viewer: ApiViewer): ReadResolution {
    return new ReadResolution(this.d, viewer);
  }
}

export class ReadResolution {
  private readonly links = new Map<string, AuthorLink | null>();
  private readonly facts = new Map<string, AuthorFacts>();
  private readonly threadVis = new Map<string, AuthorVisibility | null>();
  private readonly jurDistricts = new Map<string, string[]>();

  constructor(
    private readonly d: IdentityReadServiceDeps,
    readonly viewer: ApiViewer,
  ) {}

  /** Resolve one author (by their per-thread persona pubkey) within one thread. */
  async resolveAuthor(authorPubkey: string, ctx: ThreadGeoContext): Promise<ResolvedAuthor> {
    const link = await this.linkOf(authorPubkey);
    if (!link) {
      // Unlinkable participant (unsigned dev-path rows): a deterministic persona, no reveal path,
      // no tier, no geo relation — nothing about them is resolvable, so nothing leaks.
      const persona = personaNameForPubkey(authorPubkey);
      return {
        author: persona,
        handle: persona,
        identity: { display: persona, handle: null, isPersona: true, isSelf: false, seed: persona, threadId: ctx.threadId },
        authorGeo: "none",
        tier: "unverified",
        official: false,
      };
    }

    const facts = await this.factsOf(link.userId);
    const authorGeo = await this.authorGeoRelation(facts.homeDistricts, ctx);
    const tier = facts.tier;
    const official = facts.officialIn.has(ctx.jurisdiction);

    // Self: always revealed to self; the hint shows the persona out-of-scope viewers see instead.
    if (this.viewer.userId && link.userId === this.viewer.userId) {
      const effective = await this.effectiveVisibility(link.userId, ctx.threadId, facts);
      return {
        author: facts.displayName,
        handle: facts.handle,
        identity: {
          display: facts.displayName,
          handle: facts.handle,
          isPersona: false,
          isSelf: true,
          seed: facts.handle,
          threadId: ctx.threadId,
          ...(effective === "public" ? {} : { seenByOthersAs: link.personaName }),
        },
        authorGeo,
        tier,
        official,
      };
    }

    const effective = await this.effectiveVisibility(link.userId, ctx.threadId, facts);
    if (this.isRevealed(effective, facts.homeDistricts)) {
      return {
        author: facts.displayName,
        handle: facts.handle,
        identity: { display: facts.displayName, handle: facts.handle, isPersona: false, isSelf: false, seed: facts.handle, threadId: ctx.threadId },
        authorGeo,
        tier,
        official,
      };
    }

    return {
      author: link.personaName,
      handle: link.personaName,
      identity: { display: link.personaName, handle: null, isPersona: true, isSelf: false, seed: link.personaName, threadId: ctx.threadId },
      authorGeo,
      tier,
      official,
    };
  }

  /** May THIS viewer see the account-level profile behind `userId`? Uses the account-default
   *  visibility only (no per-thread override) — exact port of the web-app's profileVisibleTo
   *  (web-app/src/lib/api/profile.ts, docs/09 §3). Self is always in scope. */
  async profileVisible(userId: string): Promise<boolean> {
    if (this.viewer.userId && userId === this.viewer.userId) return true;
    const facts = await this.factsOf(userId);
    return this.isRevealed(facts.accountVisibility, facts.homeDistricts);
  }

  /** Whether the author's identity within ONE thread is revealed to this viewer — the per-thread
   *  override applies here (effectiveVisibility), unlike profileVisible. The profile tabs use this
   *  to keep per-thread-anonymous participation OFF the account surface: an override severs the
   *  account↔thread link in both directions (docs/09 §2), so a visible profile must never list a
   *  thread whose persona would mask this same author on the thread side. Self always revealed. */
  async threadRevealed(userId: string, threadId: string): Promise<boolean> {
    if (this.viewer.userId && userId === this.viewer.userId) return true;
    const facts = await this.factsOf(userId);
    const effective = await this.effectiveVisibility(userId, threadId, facts);
    return this.isRevealed(effective, facts.homeDistricts);
  }

  /** May THIS viewer see the identity behind an author with `visibility`? Exact port of the
   *  web-app's isRevealed (read-model/visibility.ts), with role standing in for the demo's
   *  "tier 3": officials are a platform role, never a KYC tier. */
  private isRevealed(visibility: AuthorVisibility, authorDistricts: string[]): boolean {
    const v = this.viewer;
    switch (visibility) {
      case "public":
        return true;
      case "id_verified":
        return v.kycRank >= 1;
      case "my_jurisdiction":
        // Demo approximation carried forward: a residency-verified viewer shares a district-less
        // author's (Global) jurisdiction; district-bearing authors need the viewer localized too.
        return v.kycRank >= 2 && (authorDistricts.length === 0 || v.homeDistricts.length > 0);
      case "my_district":
        return v.kycRank >= 2 && overlaps(authorDistricts, v.homeDistricts);
      case "all_officials":
        return v.officialIn.size > 0;
      case "my_officials":
        return v.officialIn.size > 0 && overlaps(authorDistricts, v.homeDistricts);
      case "anonymous":
        return false;
    }
  }

  /**
   * A Residency author's spatial relation to the open thread, most-specific-first
   * (home > affected > jurisdiction > none) — exact port of the web-app's authorGeoRelation
   * (read-model/geography.ts), including the jurisdiction-wide drop-off: when a post affects its
   * whole jurisdiction, every in-jurisdiction resident is "affected" and the narrower
   * "jurisdiction" rung can't exist.
   */
  private async authorGeoRelation(authorDistricts: string[], ctx: ThreadGeoContext): Promise<AuthorGeoRelation> {
    if (authorDistricts.length === 0) return "none";

    // "home" needs a residency-verified viewer (the privileged relation).
    if (this.viewer.kycRank >= 2 && overlaps(authorDistricts, this.viewer.homeDistricts)) {
      return "home";
    }

    const jurisdictionDistricts = await this.districtsOf(ctx.jurisdiction);
    const inJurisdiction = authorDistricts.some((s) => jurisdictionDistricts.includes(s));

    if (jurisdictionWide(ctx.affectedDistricts, jurisdictionDistricts)) {
      return inJurisdiction ? "affected" : "none";
    }
    if (authorDistricts.some((s) => ctx.affectedDistricts.includes(s))) return "affected";
    if (inJurisdiction) return "jurisdiction";
    return "none";
  }

  /** Effective visibility for (author, thread): thread override ?? account default ?? anonymous. */
  private async effectiveVisibility(userId: string, threadId: string, facts: AuthorFacts): Promise<AuthorVisibility> {
    const key = `${userId}::${threadId}`;
    let thread = this.threadVis.get(key);
    if (thread === undefined) {
      const raw = await this.d.recordStore.getThreadVisibility(userId, threadId);
      thread = raw == null ? null : normalizeVisibility(raw);
      this.threadVis.set(key, thread);
    }
    return thread ?? facts.accountVisibility;
  }

  /** Every seat slug in a jurisdiction's in-force boundary set (memoized; [] when none ingested). */
  async districtsOf(jurisdictionId: string): Promise<string[]> {
    let slugs = this.jurDistricts.get(jurisdictionId);
    if (!slugs) {
      const rows = await this.d.geoStore.listDistrictsAsOf(jurisdictionId, new Date());
      slugs = rows.map((r) => r.districtSlug);
      this.jurDistricts.set(jurisdictionId, slugs);
    }
    return slugs;
  }

  private async linkOf(authorPubkey: string): Promise<AuthorLink | null> {
    if (this.links.has(authorPubkey)) return this.links.get(authorPubkey)!;
    const tk = await this.d.recordStore.getThreadKey(authorPubkey);
    let link: AuthorLink | null = null;
    if (tk) {
      const personaName = (await this.d.recordStore.getPersonaName(authorPubkey)) ?? personaNameForPubkey(authorPubkey);
      link = { userId: tk.userId, personaName };
    }
    this.links.set(authorPubkey, link);
    return link;
  }

  private async factsOf(userId: string): Promise<AuthorFacts> {
    const cached = this.facts.get(userId);
    if (cached) return cached;
    const [user, profile, tierRaw, memberships, point] = await Promise.all([
      this.d.userRepo.getById(userId),
      this.d.profileRepo.getByUserId(userId),
      this.d.kycRepo.latestTier(userId),
      this.d.membershipRepo.listForUser(userId),
      this.d.participantGeoService.currentPoint(userId),
    ]);
    const officialIn = new Set(memberships.filter((m) => m.role === "official").map((m) => m.jurisdictionId));
    const represented = new Map(
      memberships
        .filter((m) => m.role === "official" && m.representedDistrictSlug)
        .map((m) => [m.jurisdictionId, m.representedDistrictSlug as string]),
    );
    const homeDistricts = new Set<string>();
    const asOf = new Date();
    for (const j of this.d.jurisdictions) {
      const rep = represented.get(j.id);
      if (rep) {
        homeDistricts.add(rep);
        continue;
      }
      if (!point) continue;
      const slug = await this.d.geoStore.districtSlugContaining(j.id, point, asOf);
      if (slug) homeDistricts.add(slug);
    }
    const facts: AuthorFacts = {
      handle: wireHandle(user?.handle),
      displayName: user?.displayName ?? displayNameFor(user?.handle ?? null, null) ?? "Unknown",
      accountVisibility: normalizeVisibility(profile?.visibility),
      tier: normalizeTier(tierRaw),
      officialIn,
      homeDistricts: [...homeDistricts],
    };
    this.facts.set(userId, facts);
    return facts;
  }
}

function overlaps(a: string[], b: string[]): boolean {
  return a.some((s) => b.includes(s));
}

/** A post that affects its WHOLE jurisdiction: no named seats, or every seat named (the web-app's
 *  jurisdictionWidePost). There the narrower "jurisdiction" relation carries no signal. */
function jurisdictionWide(affectedDistricts: string[], jurisdictionDistricts: string[]): boolean {
  return (
    affectedDistricts.length === 0 ||
    (jurisdictionDistricts.length > 0 && jurisdictionDistricts.every((s) => affectedDistricts.includes(s)))
  );
}
