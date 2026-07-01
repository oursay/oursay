"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, MessageSquare, ThumbsUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getProfile } from "@/lib/api";
import type { ActivityKind, PublicProfile } from "@/lib/types";
import { Avatar, FeedCard, VerificationPill } from "@/components";
import { RECORD_TYPE_ICON } from "@/components/content";
import { districtName } from "@/lib/mock";
import { districtPath, postPath, postPathForId, profilePath } from "@/lib/routes";
import { useApp } from "@/lib/state";

type Tab = "posts" | "activity" | "mentions";

const ACTIVITY_META: Record<ActivityKind, { icon: LucideIcon; label: string }> = {
  statement: { icon: RECORD_TYPE_ICON.statement, label: "Statements" },
  comment: { icon: MessageSquare, label: "Comments" },
  petition: { icon: RECORD_TYPE_ICON.petition, label: "Petitions" },
  poll: { icon: RECORD_TYPE_ICON.poll, label: "Polls" },
  reaction: { icon: ThumbsUp, label: "Reactions" },
};

/** Activity kind -> fallback record id when recordId is absent. */
function activityToRecordId(kind: ActivityKind): string {
  if (kind === "petition") return "pet-wei-path";
  if (kind === "poll") return "poll-ableg-budget";
  return "stmt-hana-ravine";
}

export function ProfileView({ handle }: { handle: string }) {
  const app = useApp();
  const { setPageJurisdiction } = app;
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [tab, setTab] = useState<Tab>("posts");

  useEffect(() => {
    setPageJurisdiction(null);
  }, [setPageJurisdiction]);

  useEffect(() => {
    getProfile(handle).then(setProfile);
  }, [handle]);

  if (!profile) {
    return <p className="p-6 text-center text-sm text-muted">Profile not found.</p>;
  }

  const { verified, profileTypes } = app.state;
  const posts = profile.posts.filter(
    (p) => profileTypes.includes(p.kind as ActivityKind) && p.tier >= verified,
  );
  const activity = profile.activity.filter((a) => profileTypes.includes(a.kind));

  return (
    <div className="space-y-4 p-4">
      <header className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <Avatar name={profile.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-ink">{profile.name}</p>
            <p className="truncate text-sm text-muted">@{profile.handle}</p>
            <p className="mt-0.5 truncate text-xs text-ink-soft">{profile.role}</p>
          </div>
          <VerificationPill tier={profile.tier} />
        </div>
        <div className="mt-3 flex gap-4">
          {profile.stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-base font-bold text-ink">{s.n}</p>
              <p className="text-[11px] text-muted">{s.label}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="flex gap-1 rounded-lg border border-border bg-surface-muted p-1">
        {(["posts", "activity", "mentions"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize ${
              tab === t ? "bg-surface text-ink shadow-sm" : "text-ink-soft"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab !== "mentions" ? (
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(ACTIVITY_META) as ActivityKind[]).map((kind) => {
            const { icon: Icon } = ACTIVITY_META[kind];
            const on = profileTypes.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => app.toggleProfileType(kind)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  on
                    ? "border-brand-300 bg-brand-100 text-brand-700"
                    : "border-border bg-surface text-muted"
                }`}
              >
                <Icon size={13} aria-hidden />
                {ACTIVITY_META[kind].label}
              </button>
            );
          })}
        </div>
      ) : null}

      {tab === "posts" ? (
        <div className="space-y-3">
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
                onAuthorClick={() => router.push(profilePath(item.handle))}
                onTitleClick={() => router.push(postPath(item.kind, item.id))}
                onCommentsClick={() =>
                  router.push(postPath(item.kind, item.id, { comments: true }))
                }
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
        <ul className="space-y-2">
          {activity.map((a, i) => {
            const Icon = ACTIVITY_META[a.kind].icon;
            const Glyph = a.icon === "#ic-edit" ? Edit3 : Icon;
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
                  <Glyph size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink">{a.text}</span>
                    <span className="block text-xs text-muted">{a.meta}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {tab === "mentions" ? (
        <ul className="space-y-2">
          {profile.mentions.map((m, i) => (
            <li key={i} className="rounded-lg border border-border bg-surface">
              {/* Author links to the profile; the row body opens the mentioned
                  record (wireframe §1 link map: mentionRow -> goPost). */}
              <div className="px-3 pt-3">
                <button
                  type="button"
                  // TODO(entityId): route to the mentioner's real profile.
                  onClick={() => router.push(profilePath(m.handle))}
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
          ))}
        </ul>
      ) : null}
    </div>
  );
}
