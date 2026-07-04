"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VenetianMask } from "lucide-react";
import { getPersonaProfile } from "@/lib/api";
import type { PersonaProfile } from "@/lib/api";
import { NOW } from "@/lib/mock";
import { relTime } from "@/lib/read-model";
import { Avatar, CommentCard, VerificationPill } from "@/components";
import {
  activityRowGlyph,
  ACTIVITY_REACTION_TONE,
  ProfileSupportBar,
  REACTION_GLYPH,
  RECORD_TYPE_ICON,
} from "@/components/content";
import { authorPath, postPathForId } from "@/lib/routes";
import { useApp } from "@/lib/state";

type Tab = "comments" | "activity" | "mentions";

/**
 * Persona profile — the anonymous mirror of ProfileView, scoped to one thread
 * (docs/entities/civic-identity/thread-persona.md). Same header/tab skeleton
 * as a profile; no @handle, no cross-thread history, no link to the real
 * account. Unknown persona names render the profile not-found state (hide
 * existence, docs/09 §3).
 */
export function PersonaView({ personaName }: { personaName: string }) {
  const app = useApp();
  const { setPageJurisdiction } = app;
  const router = useRouter();
  const [profile, setProfile] = useState<PersonaProfile | null | undefined>();
  const [tab, setTab] = useState<Tab>("comments");

  useEffect(() => {
    setPageJurisdiction(null);
  }, [setPageJurisdiction]);

  useEffect(() => {
    getPersonaProfile(personaName, app.viewer).then(setProfile);
  }, [personaName, app.viewer]);

  if (profile === undefined) {
    return <p className="p-6 text-center text-sm text-muted">Loading…</p>;
  }
  if (profile === null) {
    return <p className="p-6 text-center text-sm text-muted">Profile not found.</p>;
  }

  const ThreadIcon = RECORD_TYPE_ICON[profile.threadKind];
  const threadTitle =
    profile.threadTitle.length > 42
      ? `${profile.threadTitle.slice(0, 42)}…`
      : profile.threadTitle;

  return (
    <div className="space-y-1 p-3">
      <header className="rounded-xl border border-border bg-surface px-3 pt-3 pb-1">
        <div className="flex items-center gap-3">
          <Avatar name={profile.name} seed={profile.name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="flex min-w-0 items-center gap-1.5 truncate font-bold text-ink">
                {profile.name}
                <VenetianMask
                  size={14}
                  className="shrink-0 text-muted"
                  aria-label="Anonymous persona"
                />
              </p>
              <VerificationPill tier={profile.tier} align="right" />
            </div>
            <button
              type="button"
              onClick={() => router.push(postPathForId(profile.threadId))}
              className="flex min-w-0 max-w-full items-center gap-1.5 text-left text-xs font-medium text-brand-700 hover:text-brand-800"
            >
              <ThreadIcon size={13} className="shrink-0" aria-hidden />
              <span className="truncate underline underline-offset-2">
                {threadTitle}
              </span>
            </button>
          </div>
        </div>
        <p className="mt-3 text-center text-sm text-ink-soft">{profile.bio}</p>
        {profile.support.agrees + profile.support.disagrees > 0 ? (
          <div className="mt-3">
            <ProfileSupportBar
              {...profile.support}
              ageLabel={profile.ageLabel}
              pill="comments"
            />
          </div>
        ) : null}
      </header>

      <div className="flex gap-1 rounded-lg border border-border bg-surface-muted p-0.5">
        {(["comments", "activity", "mentions"] as Tab[]).map((t) => (
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

      {tab === "comments" ? (
        <div className="max-h-[62vh] space-y-4 overflow-y-auto overscroll-auto rounded-lg border border-border bg-surface p-3 pr-2">
          {profile.comments.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">
              No comments in this thread.
            </p>
          ) : (
            profile.comments.map((node, i) => (
              <CommentCard
                key={i}
                author={node.author}
                tier={node.tier}
                signTier={node.signTier}
                identity={node.identity}
                timestamp={relTime(node.ts, NOW)}
                body={
                  <>
                    {node.body.map((line, li) => (
                      <p key={li}>{line}</p>
                    ))}
                  </>
                }
                up={node.up}
                down={node.down}
                edits={node.edits}
                onReact={() =>
                  app.requireAuth(() => app.notify("Reaction recorded (demo)."))
                }
                onEditsClick={() =>
                  app.notify("Edit history is not built in this demo.")
                }
              />
            ))
          )}
        </div>
      ) : null}

      {tab === "activity" ? (
        <ul className="max-h-[62vh] space-y-2 overflow-y-auto overscroll-auto pr-1 pb-1">
          {profile.activity.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">
              No other activity in this thread.
            </p>
          ) : (
            profile.activity.map((a, i) => {
              const glyph = activityRowGlyph(a);
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => router.push(postPathForId(a.recordId ?? profile.threadId))}
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
            <p className="py-4 text-center text-sm text-muted">
              No mentions in this thread.
            </p>
          ) : (
            profile.mentions.map((m, i) => (
              <li key={i} className="rounded-lg border border-border bg-surface">
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
                  onClick={() => router.push(postPathForId(m.recordId ?? profile.threadId))}
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
