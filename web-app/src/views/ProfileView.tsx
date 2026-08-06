"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Pencil } from "lucide-react";
import {
  getProfile,
  listProfileActivity,
  listProfileMentions,
  listProfilePosts,
} from "@/lib/api";
import type { ActivityKind, PublicProfile } from "@/lib/types";
import { Avatar, EntityMark, EntityMarkGroup, FeedCard } from "@/components";
import { Button } from "@/components/ui";
import {
  ActivityRow,
  MentionText,
  ProfileSupportBar,
  RoleTag,
} from "@/components/content";
import { InfiniteScrollFooter, InfiniteScrollSentinel } from "@/components/utils";
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
import { recordShareTarget } from "@/lib/share";
import { useApp, useHydrateRecordState } from "@/lib/state";
import { useCursorInfiniteList } from "@/lib/hooks/useCursorInfiniteList";
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
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("posts");
  const [rolesExpanded, setRolesExpanded] = useState(false);
  const now = useNow();
  const wireHandleParam = wireHandle(handle) ?? handle;

  const verified = app.effectiveVerified;
  const { profileTypes } = app.state;

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
    setProfile(undefined);
    getProfile(wireHandleParam, { viewer: app.viewer }).then(setProfile);
  }, [wireHandleParam, app.viewer]);

  useEffect(() => {
    if (!self && profile && wireHandleParam !== profile.handle) {
      router.replace(profilePath(profile.handle));
    }
  }, [profile, wireHandleParam, router, self]);

  const tabParams = useMemo(
    () => ({ profileTypes, tierMin: verified, viewer: app.viewer }),
    [profileTypes, verified, app.viewer],
  );

  const postsKey = useMemo(
    () => JSON.stringify({ wireHandleParam, tab: "posts", ...tabParams }),
    [wireHandleParam, tabParams],
  );
  const activityKey = useMemo(
    () => JSON.stringify({ wireHandleParam, tab: "activity", ...tabParams }),
    [wireHandleParam, tabParams],
  );
  const mentionsKey = useMemo(
    () => JSON.stringify({ wireHandleParam, tab: "mentions", viewer: app.viewer }),
    [wireHandleParam, app.viewer],
  );

  const fetchPosts = useCallback(
    (cursor: string | null) =>
      listProfilePosts(wireHandleParam, { ...tabParams, cursor }),
    [wireHandleParam, tabParams],
  );
  const fetchActivity = useCallback(
    (cursor: string | null) =>
      listProfileActivity(wireHandleParam, { ...tabParams, cursor }),
    [wireHandleParam, tabParams],
  );
  const fetchMentions = useCallback(
    (cursor: string | null) =>
      listProfileMentions(wireHandleParam, { viewer: app.viewer, cursor }),
    [wireHandleParam, app.viewer],
  );

  const postsList = useCursorInfiniteList({
    resetKey: postsKey,
    enabled: profile != null && tab === "posts",
    fetchPage: fetchPosts,
    getItemId: (item) => item.id,
  });
  const activityList = useCursorInfiniteList({
    resetKey: activityKey,
    enabled: profile != null && tab === "activity",
    fetchPage: fetchActivity,
    getItemId: (item) => `${item.recordId ?? item.kind}-${item.ts ?? item.text}`,
  });
  const mentionsList = useCursorInfiniteList({
    resetKey: mentionsKey,
    enabled: profile != null && tab === "mentions",
    fetchPage: fetchMentions,
    getItemId: (item) => `${item.recordId ?? "mention"}-${item.ts ?? item.text}`,
  });

  const hydrateIds = useMemo(
    () => (tab === "posts" ? postsList.items.map((p) => p.id) : []),
    [tab, postsList.items],
  );
  useHydrateRecordState(hydrateIds);

  if (profile === undefined) {
    return <p className="p-6 text-center text-sm text-muted">Loading profile…</p>;
  }
  if (profile === null) {
    return <p className="p-6 text-center text-sm text-muted">Profile not found.</p>;
  }

  const displayTier = self ? app.state.kycTier : profile.tier;
  const displayOfficial = self ? app.state.isOfficial : Boolean(profile.official);
  const displayRoles: ProfileRoleTag[] =
    self && displayOfficial
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

  return (
    <div className="space-y-1 p-3">
      <header className="rounded-xl border border-border bg-surface px-3 pt-3 pb-1">
        <div className="flex items-center gap-3">
          <Avatar name={profile.name} seed={profile.handle} iconType={profile.iconType} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-bold text-ink">{profile.name}</p>
              <span className="inline-flex shrink-0 items-center gap-0.5 ml-auto">
                <EntityMarkGroup
                  tier={displayTier}
                  official={displayOfficial}
                  platformRole={profile.platformRole}
                  media={profile.mediaMark}
                  signedMode="icon"
                  kycMode="full"
                />
              </span>
            </div>
            <p className="truncate text-sm text-muted">{displayHandle(profile.handle)}</p>
            {displayOfficial && displayRoles.length > 0 ? (
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
            onClick={() => setTab(t)}
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
        <div className="space-y-3 pb-1">
          {postsList.loading && postsList.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Loading posts…</p>
          ) : postsList.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">No posts match the filters.</p>
          ) : (
            postsList.items.map((item) => {
              const personaHint = personaHintPath(item.identity);
              return (
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
                onEditsClick={() => app.notify(DEFERRED_EDIT_HISTORY)}
                onDistrictClick={(s) => router.push(districtPath(s))}
              />
              );
            })
          )}
          <InfiniteScrollFooter
            loading={postsList.loading}
            loadingMore={postsList.loadingMore}
            error={postsList.error}
            hasMore={postsList.hasMore}
            empty={postsList.items.length === 0}
          />
          <InfiniteScrollSentinel
            onVisible={postsList.loadMore}
            disabled={!postsList.hasMore || postsList.loading || postsList.loadingMore}
            watchKey={postsList.items.length}
          />
        </div>
      ) : null}

      {tab === "activity" ? (
        <ul className="space-y-2 pb-1">
          {activityList.loading && activityList.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Loading activity…</p>
          ) : activityList.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">No activity matches the filters.</p>
          ) : (
            activityList.items.map((a, i) => (
              <ActivityRow
                key={`${a.recordId ?? a.kind}-${a.ts ?? i}`}
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
          <InfiniteScrollFooter
            loading={activityList.loading}
            loadingMore={activityList.loadingMore}
            error={activityList.error}
            hasMore={activityList.hasMore}
            empty={activityList.items.length === 0}
          />
          <InfiniteScrollSentinel
            onVisible={activityList.loadMore}
            disabled={!activityList.hasMore || activityList.loading || activityList.loadingMore}
            watchKey={activityList.items.length}
          />
        </ul>
      ) : null}

      {tab === "mentions" ? (
        <ul className="space-y-2 pb-1">
          {mentionsList.loading && mentionsList.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Loading mentions…</p>
          ) : mentionsList.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">No mentions yet.</p>
          ) : (
            mentionsList.items.map((m, i) => (
            <li key={`${m.recordId ?? "mention"}-${m.ts ?? i}`} className="rounded-lg border border-border bg-surface">
              <div className="px-3 pt-3">
                <button
                  type="button"
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
          <InfiniteScrollFooter
            loading={mentionsList.loading}
            loadingMore={mentionsList.loadingMore}
            error={mentionsList.error}
            hasMore={mentionsList.hasMore}
            empty={mentionsList.items.length === 0}
          />
          <InfiniteScrollSentinel
            onVisible={mentionsList.loadMore}
            disabled={!mentionsList.hasMore || mentionsList.loading || mentionsList.loadingMore}
            watchKey={mentionsList.items.length}
          />
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
