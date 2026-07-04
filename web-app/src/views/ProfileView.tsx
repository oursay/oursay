"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Pencil } from "lucide-react";
import { getProfile } from "@/lib/api";
import type { ActivityKind, PublicProfile } from "@/lib/types";
import { Avatar, FeedCard, VerificationPill } from "@/components";
import { Button } from "@/components/ui";
import {
  activityRowGlyph,
  ACTIVITY_REACTION_TONE,
  ProfileSupportBar,
  REACTION_GLYPH,
} from "@/components/content";
import { districtName, MY_DISTRICTS } from "@/lib/mock";
import { authorPath, districtPath, postPath, postPathForId, profilePath } from "@/lib/routes";
import { recordShareTarget } from "@/lib/share";
import { useApp } from "@/lib/state";

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

  useEffect(() => {
    setPageJurisdiction(null);
  }, [setPageJurisdiction]);

  useEffect(() => {
    // Viewer-scoped: out-of-visibility profiles resolve null (hide existence),
    // and the reveal set updates live as the demo KYC tier cycles.
    getProfile(handle, { viewer: app.viewer }).then(setProfile);
  }, [handle, app.viewer]);

  useEffect(() => {
    if (!self && profile && handle !== profile.handle) {
      router.replace(profilePath(profile.handle));
    }
  }, [profile, handle, router, self]);

  if (!profile) {
    return <p className="p-6 text-center text-sm text-muted">Profile not found.</p>;
  }

  const { profileTypes } = app.state;
  const verified = app.effectiveVerified;
  // Self mode reflects the live session tier so Validate ID updates the pill.
  const displayTier = self ? app.state.kycTier : profile.tier;
  // The role line is an official title, shown only on Official accounts. The
  // self account's seeded role says "Member", so derive its title from the
  // home riding when the demo tier reaches Official.
  const displayRole =
    self && displayTier === 3
      ? `MLA · ${districtName(MY_DISTRICTS[0])}`
      : profile.role;
  const posts = profile.posts.filter(
    (p) => profileTypes.includes(p.kind as ActivityKind) && p.tier >= verified,
  );
  const activity = profile.activity.filter((a) => profileTypes.includes(a.kind));

  return (
    <div className="space-y-1 p-3">
      <header className="rounded-xl border border-border bg-surface px-3 pt-3 pb-1">
        <div className="flex items-center gap-3">
          <Avatar name={profile.name} seed={profile.handle} size="lg" />
          <div className="min-w-0 flex-1">
            {/* Pill shares the name row (right-justified, like posts) so the
                role line below keeps the full width for long district names. */}
            <div className="flex items-center gap-2">
              <p className="truncate font-bold text-ink">{profile.name}</p>
              <VerificationPill tier={displayTier} align="right" />
            </div>
            <p className="truncate text-sm text-muted">@{profile.handle}</p>
            {displayTier === 3 ? (
              <p className="mt-0.5 truncate text-xs text-ink-soft">{displayRole}</p>
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
              showReactions={!self && displayTier === 3}
            />
          </div>
        ) : null}
        {self ? (
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2">
            <Button
              size="sm"
              variant="outline"
              icon={Pencil}
              onClick={() => app.notify("Edit Profile is not built in this demo.")}
            >
              Edit Profile
            </Button>
            <Button size="sm" icon={BadgeCheck} onClick={app.cycleKyc}>
              Validate ID
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
        <div className="max-h-[62vh] space-y-3 overflow-y-auto overscroll-auto pr-1 pb-1">
          {posts.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">No posts match the filters.</p>
          ) : (
            posts.map((item) => (
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
                  app.notify("Edit history is not built in this demo.")
                }
                onDistrictClick={(s) => router.push(districtPath(s))}
              />
            ))
          )}
        </div>
      ) : null}

      {tab === "activity" ? (
        <ul className="max-h-[62vh] space-y-2 overflow-y-auto overscroll-auto pr-1 pb-1">
          {activity.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">No activity matches the filters.</p>
          ) : (
            activity.map((a, i) => {
            const glyph = activityRowGlyph(a);
            return (
              <li key={i}>
                <button
                  type="button"
                  // TODO(entityId): route to the acted-on record by id.
                  onClick={() =>
                    router.push(
                      postPathForId(a.recordId ?? activityToRecordId(a.kind)),
                    )
                  }
                  className="flex w-full items-start gap-3 rounded-lg border border-border bg-surface p-3 text-left hover:bg-surface-muted"
                >
                  {glyph.type === "reaction" ? (
                    <span
                      aria-hidden
                      className={`mt-0.5 inline-flex size-4 shrink-0 items-center justify-center text-sm font-bold leading-none ${
                        glyph.alt
                          ? ACTIVITY_REACTION_TONE.alt
                          : ACTIVITY_REACTION_TONE.default
                      }`}
                    >
                      {REACTION_GLYPH[glyph.dir]}
                    </span>
                  ) : (
                    <glyph.icon
                      size={16}
                      className="mt-0.5 shrink-0 text-brand-600"
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink">{a.text}</span>
                    <span className="block text-xs text-muted">{a.meta}</span>
                  </span>
                </button>
              </li>
            );
          })
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
                // TODO(entityId): route to the mentioned record by id.
                onClick={() =>
                  router.push(postPathForId(m.recordId ?? "stmt-hana-ravine"))
                }
                className="block w-full px-3 pb-3 pt-0.5 text-left hover:bg-surface-muted"
              >
                <span className="block text-sm text-ink-soft">{m.text}</span>
                <span className="mt-0.5 block text-xs text-muted">{m.meta}</span>
              </button>
            </li>
          ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
