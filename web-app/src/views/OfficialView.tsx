"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, User } from "lucide-react";
import { getOfficialProfile, type OfficialProfile } from "@/lib/api/official";
import { OFFICIAL_SEAT_ICON_TYPE } from "@/lib/avatar";
import {
  ActivityRow,
  Avatar,
  Button,
  EntityMark,
  FeedCard,
  MentionText,
  ProfileSupportBar,
} from "@/components";
import {
  authorPath,
  districtPath,
  personaHintPath,
  postPath,
  postPathForId,
  profilePath,
} from "@/lib/routes";
import { districtName } from "@/lib/mock";
import { relTime, useNow } from "@/lib/read-model";
import { useApp, useHydrateRecordState } from "@/lib/state";
import type { ActivityKind } from "@/lib/types";
import { DEFERRED_CLAIM_PROFILE, DEFERRED_EDIT_HISTORY } from "@/lib/api/deferred";
import { recordShareTarget } from "@/lib/share";
import { InfiniteScrollFooter, InfiniteScrollSentinel } from "@/components/utils";
import { useLocalInfiniteList } from "@/lib/hooks/useLocalInfiniteList";

type Tab = "posts" | "activity" | "mentions";

function activityToRecordId(kind: ActivityKind): string {
  if (kind === "petition") return "pet-wei-path";
  if (kind === "poll") return "poll-ableg-budget";
  return "stmt-hana-ravine";
}

/**
 * Official seat profile — auto-generated from public record (docs/11-USER-FLOWS §7.1).
 * Presents the office seat first; the current holder is a secondary link when claimed.
 */
export function OfficialView({ handle }: { handle: string }) {
  const app = useApp();
  const { setPageJurisdiction } = app;
  const router = useRouter();
  const [profile, setProfile] = useState<OfficialProfile | null | undefined>();
  const [tab, setTab] = useState<Tab>("posts");
  const now = useNow();

  useEffect(() => {
    setPageJurisdiction(null);
  }, [setPageJurisdiction]);

  useEffect(() => {
    getOfficialProfile(handle).then(setProfile);
  }, [handle]);

  const verified = app.effectiveVerified;
  const { profileTypes } = app.state;
  const postIds = useMemo(
    () =>
      profile?.posts
        ?.filter(
          (p) =>
            profile.claimed &&
            profileTypes.includes(p.kind as ActivityKind) &&
            p.tier >= verified,
        )
        .map((p) => p.id) ?? [],
    [profile, profileTypes, verified],
  );
  useHydrateRecordState(postIds);

  const filteredPosts = useMemo(
    () =>
      profile?.posts?.filter(
        (p) => profileTypes.includes(p.kind as ActivityKind) && p.tier >= verified,
      ) ?? [],
    [profile, profileTypes, verified],
  );
  const filteredActivity = useMemo(
    () => profile?.activity?.filter((a) => profileTypes.includes(a.kind)) ?? [],
    [profile, profileTypes],
  );
  const filteredMentions = useMemo(
    () => profile?.mentions ?? [],
    [profile],
  );

  const postsList = useLocalInfiniteList({
    items: filteredPosts,
    getItemId: (item) => item.id,
    enabled: tab === "posts" && !!profile?.claimed,
  });
  const activityList = useLocalInfiniteList({
    items: filteredActivity,
    getItemId: (item) => `${item.recordId ?? item.kind}-${item.ts ?? item.text}`,
    enabled: tab === "activity" && !!profile?.claimed,
  });
  const mentionsList = useLocalInfiniteList({
    items: filteredMentions,
    getItemId: (item) => `${item.recordId ?? "mention"}-${item.ts ?? item.text}`,
    enabled: tab === "mentions",
  });

  const selectTab = (t: Tab) => {
    setTab(t);
  };

  if (profile === undefined) {
    return <p className="p-6 text-center text-sm text-muted">Loading…</p>;
  }
  if (profile === null) {
    return <p className="p-6 text-center text-sm text-muted">Official profile not found.</p>;
  }

  const support = profile.support ?? {
    agrees: 0,
    disagrees: 0,
    statements: 0,
    comments: 0,
  };
  const showSupport = support.agrees + support.disagrees > 0;
  const claimedUserHandle = profile.claimedUserHandle ?? profile.handle;

  const representativeRow = profile.claimed ? (
    <button
      type="button"
      onClick={() => router.push(profilePath(claimedUserHandle))}
      className="flex min-w-0 max-w-full items-center gap-1.5 text-left text-xs font-medium text-brand-700 hover:text-brand-800"
    >
      <User size={13} className="shrink-0" aria-hidden />
      <span className="truncate underline underline-offset-2">
        {profile.representativeName}
      </span>
    </button>
  ) : (
    <p className="flex min-w-0 max-w-full items-center gap-1.5 text-xs italic text-muted">
      <User size={13} className="shrink-0" aria-hidden />
      <span className="truncate pr-1">{profile.representativeName}</span>
    </p>
  );

  return (
    <div className="space-y-1 p-3">
      <header className="rounded-xl border border-border bg-surface px-3 pt-3 pb-3">
        <div className="flex items-center gap-3">
            <Avatar
              name={profile.representativeName}
              seed={claimedUserHandle ?? profile.handle ?? profile.role}
              iconType={OFFICIAL_SEAT_ICON_TYPE}
              size="lg"
            />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-bold text-ink">{profile.role}</p>
              {/* Verification badge only when the office holder actually claimed
                  the seat — an unclaimed roster listing asserts no verification. */}
              {profile.claimed ? (
                <EntityMark type="official" subtype="official" mode="full" />
              ) : null}
            </div>
            {representativeRow}
          </div>
        </div>

        {profile.bio ? (
          <p
            className={`mt-3 text-center text-sm text-ink-soft ${
              profile.bioAutoGenerated ? "italic" : ""
            }`}
          >
            {profile.bio}
          </p>
        ) : null}

        {profile.claimed && showSupport ? (
          <div className="mt-3">
            <ProfileSupportBar
              {...support}
              ageLabel={profile.ageLabel ?? ""}
              showReactions
            />
          </div>
        ) : null}

        {!profile.claimed ? (
          <div className="mt-4">
            <Button
              variant="primary"
              size="sm"
              fullWidth
              icon={BadgeCheck}
              onClick={() => app.notify(DEFERRED_CLAIM_PROFILE)}
            >
              Claim Profile
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
        <div className="space-y-3 pb-1">
          {!profile.claimed ? (
            <p className="py-4 text-center text-sm text-muted">
              No posts yet — activity appears here after the office holder claims this profile.
            </p>
          ) : postsList.loading && postsList.items.length === 0 ? (
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
                  onAuthorClick={() =>
                    router.push(authorPath(item.identity, item.handle))
                  }
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
            disabled={!profile.claimed || !postsList.hasMore || postsList.loading || postsList.loadingMore}
            watchKey={postsList.items.length}
          />
        </div>
      ) : null}

      {tab === "activity" ? (
        <ul className="space-y-2 pb-1">
          {!profile.claimed ? (
            <p className="py-4 text-center text-sm text-muted">
              No activity yet — activity appears here after the office holder claims this profile.
            </p>
          ) : activityList.loading && activityList.items.length === 0 ? (
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
            disabled={!profile.claimed || !activityList.hasMore || activityList.loading || activityList.loadingMore}
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
