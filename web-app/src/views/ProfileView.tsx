"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Pencil } from "lucide-react";
import { getProfile } from "@/lib/api";
import type { ActivityKind, PublicProfile } from "@/lib/types";
import { Avatar, FeedCard, VerificationPill } from "@/components";
import { Button } from "@/components/ui";
import {
  ActivityRow,
  MentionText,
  ProfileSupportBar,
  RoleTag,
} from "@/components/content";
import { districtName, MY_DISTRICTS } from "@/lib/mock";
import { relTime, useNow } from "@/lib/read-model";
import { displayHandle, wireHandle } from "@/lib/handle";
import {
  authorPath,
  districtPath,
  jurisdictionPath,
  officialPath,
  postPath,
  postPathForId,
  profilePath,
  personaHintPath,
} from "@/lib/routes";
import type { ProfileRoleTag } from "@/lib/types";
import { recordShareTarget, collectCommentIds, commentReactionKey } from "@/lib/share";
import { useApp, useHydrateRecordState } from "@/lib/state";
import { DEFERRED_EDIT_HISTORY } from "@/lib/api/deferred";

type Tab = "posts" | "activity" | "mentions";

/** Activity kind -> fallback record id when recordId is absent. */
function activityToRecordId(kind: ActivityKind): string {
  if (kind === "petition") return "pet-wei-path";
  if (kind === "poll") return "poll-ableg-budget";
  return "stmt-hana-ravine";
}

/** Public profile view; `self` adds the account's own controls (edit, Validate ID). */
export function ProfileView({
  handle,
  self = false,
}: {
  handle: string;
  self?: boolean;
}) {
  const app = useApp();
  const { setPageJurisdiction } = app;
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [tab, setTab] = useState<Tab>("posts");
  const [rolesExpanded, setRolesExpanded] = useState(false);
  const now = useNow();
  const wireHandleParam = wireHandle(handle) ?? handle;

  const selectTab = (t: Tab) => {
    setTab(t);
  };

  useEffect(() => {
    setPageJurisdiction(null);
  }, [setPageJurisdiction]);

  useEffect(() => {
    if (self) return;
    if (wireHandleParam && handle !== wireHandleParam) {
      router.replace(profilePath(wireHandleParam));
    }
  }, [handle, wireHandleParam, router, self]);

  useEffect(() => {
    // Viewer-scoped: out-of-visibility profiles resolve null (hide existence),
    // and the reveal set updates live as the demo KYC tier cycles.
    getProfile(wireHandleParam, { viewer: app.viewer }).then(setProfile);
  }, [wireHandleParam, app.viewer]);

  useEffect(() => {
    if (!self && profile && wireHandleParam !== profile.handle) {
      router.replace(profilePath(profile.handle));
    }
  }, [profile, wireHandleParam, router, self]);

  const verified = app.effectiveVerified;
  const { profileTypes } = app.state;
  const postIds = useMemo(
    () =>
      profile?.posts
        .filter(
          (p) =>
            profileTypes.includes(p.kind as ActivityKind) && p.tier >= verified,
        )
        .map((p) => p.id) ?? [],
    [profile, profileTypes, verified],
  );
  useHydrateRecordState(postIds);

  if (!profile) {
    return <p className="p-6 text-center text-sm text-muted">Profile not found.</p>;
  }

  // Self mode reflects the live session tier so Validate ID updates the pill.
  const displayTier = self ? app.state.kycTier : profile.tier;
  const displayRoles: ProfileRoleTag[] =
    self && displayTier === 3
      ? [
          {
            roleLabel: "MLA",
            placeLabel: districtName(MY_DISTRICTS[0]),
            jurisdictionId: "ab-ca-gov",
            districtSlug: MY_DISTRICTS[0],
            seatHandle: null,
            placeKind: "district",
          },
        ]
      : profile.roles?.length
        ? profile.roles
        : profile.role && profile.role !== "Official" && profile.role !== "Member"
          ? parseLegacyRole(profile.role)
          : [];
  const multiRole = displayRoles.length > 1;
  const roleClick = (tag: ProfileRoleTag) => {
    if (tag.seatHandle) {
      const path = officialPath(tag.seatHandle);
      if (path) router.push(path);
      return;
    }
    router.push(profilePath(profile.handle));
  };
  const placeClick = (tag: ProfileRoleTag) => {
    if (tag.placeKind === "district" && tag.districtSlug) {
      router.push(districtPath(tag.districtSlug, { jurisdictionId: tag.jurisdictionId }));
      return;
    }
    router.push(jurisdictionPath(tag.jurisdictionId));
  };
  const posts = profile.posts.filter(
    (p) => profileTypes.includes(p.kind as ActivityKind) && p.tier >= verified,
  );
  const activity = profile.activity.filter((a) => profileTypes.includes(a.kind));

  return (
    <div className="space-y-1 p-3">
      <header className="rounded-xl border border-border bg-surface px-3 pt-3 pb-1">
        <div className="flex items-center gap-3">
          <Avatar name={profile.name} seed={profile.handle} iconType={profile.iconType} size="lg" />
          <div className="min-w-0 flex-1">
            {/* Pill shares the name row (right-justified, like posts) so the
                role line below keeps the full width for long district names. */}
            <div className="flex items-center gap-2">
              <p className="truncate font-bold text-ink">{profile.name}</p>
              <VerificationPill tier={displayTier} align="right" />
            </div>
            <p className="truncate text-sm text-muted">{displayHandle(profile.handle)}</p>
            {displayTier === 3 && displayRoles.length > 0 ? (
              <div className="mt-0.5 min-w-0">
                <RoleTag
                  roles={displayRoles}
                  expanded={rolesExpanded}
                  onExpandToggle={() => setRolesExpanded((v) => !v)}
                  onRoleClick={roleClick}
                  onPlaceClick={placeClick}
                  part={rolesExpanded && multiRole ? "head" : "all"}
                />
                {rolesExpanded && multiRole ? (
                  <RoleTag
                    roles={displayRoles}
                    expanded
                    onExpandToggle={() => setRolesExpanded(false)}
                    onRoleClick={roleClick}
                    onPlaceClick={placeClick}
                    part="tail"
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {profile.bio ? (
          <p className="mt-3 text-center text-sm text-ink-soft">{profile.bio}</p>
        ) : null}
        {profile.support.agrees + profile.support.disagrees > 0 ? (
          <div className="mt-3">
            <ProfileSupportBar
              {...profile.support}
              ageLabel={profile.ageLabel}
              showReactions
            />
          </div>
        ) : null}
        {self ? (
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2">
            <Button
              size="sm"
              variant="outline"
              icon={Pencil}
              onClick={() => app.openEditProfile()}
            >
              Edit Profile
            </Button>
            <Button size="sm" icon={BadgeCheck} onClick={app.openVerify}>
              Get Verified
            </Button>
          </div>
        ) : null}
      </header>

      <div className="flex gap-1 rounded-lg border border-border bg-surface-muted p-0.5">
        {(["posts", "activity", "mentions"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => selectTab(t)}
            className={`flex-1 rounded-md py-1 text-sm capitalize ${
              tab === t
                ? "font-semibold text-ink underline decoration-2 underline-offset-4"
                : "font-medium text-ink-soft"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "posts" ? (
        <div className="max-h-[62vh] space-y-3 overflow-y-auto overscroll-auto pr-1 pb-1">
          {posts.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">No posts match the filters.</p>
          ) : (
            posts.map((item) => {
              const personaHint = personaHintPath(item.identity);
              return (
              // TODO(entityId): representative-target nav — route by record/profile id.
              <FeedCard
                key={item.id}
                item={{
                  ...item,
                  sig: app.petitionSigFor(item),
                  ...app.reactionCountsFor(item),
                }}
                viewer={app.viewer}
                tierMin={verified}
                resolveDistrict={districtName}
                onAuthorClick={() => router.push(authorPath(item.identity, item.handle))}
                onPersonaClick={
                  personaHint ? () => router.push(personaHint) : undefined
                }
                onTitleClick={() => router.push(postPath(item.kind, item.id))}
                onCommentsClick={() =>
                  router.push(postPath(item.kind, item.id, { comments: true }))
                }
                onShare={() => app.openShare(recordShareTarget(item))}
                shareCount={app.shareCountFor(item.id)}
                shared={app.hasShared(item.id)}
                onReact={(dir) => app.react(item, dir)}
                selectedReaction={app.reactionFor(item.id)}
                selectedVote={app.voteFor(item.id)}
                signedPetition={app.hasSignedPetition(item.id)}
                onVote={(label) => app.votePoll(item, label)}
                onSignPetition={() => app.signPetition(item)}
                onEditsClick={() =>
                  app.notify(DEFERRED_EDIT_HISTORY)
                }
                onDistrictClick={(s) => router.push(districtPath(s))}
              />
              );
            })
          )}
        </div>
      ) : null}

      {tab === "activity" ? (
        <ul className="max-h-[62vh] space-y-2 overflow-y-auto overscroll-auto pr-1 pb-1">
          {activity.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">No activity matches the filters.</p>
          ) : (
            activity.map((a, i) => (
              <ActivityRow
                key={i}
                item={a}
                now={now}
                onOpen={() =>
                  router.push(
                    postPathForId(a.recordId ?? activityToRecordId(a.kind)),
                  )
                }
              />
            ))
          )}
        </ul>
      ) : null}

      {tab === "mentions" ? (
        <ul className="max-h-[62vh] space-y-2 overflow-y-auto overscroll-auto pr-1 pb-1">
          {profile.mentions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">No mentions yet.</p>
          ) : (
            profile.mentions.map((m, i) => (
            <li key={i} className="rounded-lg border border-border bg-surface">
              {/* Author links to the profile; the row body opens the mentioned
                  record (wireframe §1 link map: mentionRow -> goPost). */}
              <div className="px-3 pt-3">
                <button
                  type="button"
                  // TODO(entityId): route to the mentioner's real profile.
                  onClick={() => router.push(authorPath(m.identity, m.handle))}
                  className="text-sm font-semibold text-ink hover:underline"
                >
                  {m.author}
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  router.push(postPathForId(m.recordId ?? "stmt-hana-ravine"))
                }
                className="block w-full px-3 pb-3 pt-0.5 text-left hover:bg-surface-muted"
              >
                <MentionText
                  text={m.text}
                  mentions={m.mentions}
                  linkable={false}
                  className="block text-sm text-ink-soft"
                />
                <span className="mt-0.5 block text-xs text-muted">
                  {m.ts ? relTime(m.ts, now) : (m.meta ?? "")}
                </span>
              </button>
            </li>
          ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function parseLegacyRole(role: string): ProfileRoleTag[] {
  const idx = role.indexOf(" · ");
  if (idx === -1) {
    return [
      {
        roleLabel: role,
        placeLabel: "",
        jurisdictionId: "ab-ca-gov",
        districtSlug: null,
        seatHandle: null,
        placeKind: "jurisdiction",
      },
    ];
  }
  return [
    {
      roleLabel: role.slice(0, idx),
      placeLabel: role.slice(idx + 3),
      jurisdictionId: "ab-ca-gov",
      districtSlug: null,
      seatHandle: null,
      placeKind: "jurisdiction",
    },
  ];
}
