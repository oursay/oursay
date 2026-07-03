"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Feather, MessageSquare, VenetianMask } from "lucide-react";
import { getPersonaActivity } from "@/lib/api";
import type { PersonaActivity } from "@/lib/api";
import { NOW } from "@/lib/mock";
import { relTime } from "@/lib/read-model";
import { Avatar, VerificationPill } from "@/components";
import { postPathForId } from "@/lib/routes";
import { useApp } from "@/lib/state";

/**
 * Per-thread persona surface (docs/entities/civic-identity/thread-persona.md).
 * Shows only what the thread already shows — the persona's avatar, tier, and
 * activity within this one thread. No profile link exists here; unknown
 * threads/personas render the same not-found copy as unknown profiles
 * (hide existence, docs/09 §3).
 */
export function PersonaView({
  threadId,
  personaName,
}: {
  threadId: string;
  personaName: string;
}) {
  const app = useApp();
  const { setPageJurisdiction } = app;
  const router = useRouter();
  const [activity, setActivity] = useState<PersonaActivity | null | undefined>();

  useEffect(() => {
    setPageJurisdiction(null);
  }, [setPageJurisdiction]);

  useEffect(() => {
    getPersonaActivity(threadId, personaName, app.viewer).then(setActivity);
  }, [threadId, personaName, app.viewer]);

  if (activity === undefined) {
    return <p className="p-6 text-center text-sm text-muted">Loading…</p>;
  }
  if (activity === null) {
    return <p className="p-6 text-center text-sm text-muted">Profile not found.</p>;
  }

  return (
    <div className="space-y-3 p-3">
      <header className="rounded-xl border border-border bg-surface px-3 py-4">
        <div className="flex items-center gap-3">
          <Avatar name={activity.personaName} seed={activity.personaName} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="flex min-w-0 items-center gap-1.5 truncate font-bold text-ink">
                {activity.personaName}
                <VenetianMask
                  size={14}
                  className="shrink-0 text-muted"
                  aria-label="Anonymous persona"
                />
              </p>
              <VerificationPill tier={activity.tier} align="right" />
            </div>
            <p className="truncate text-sm italic text-muted">
              Anonymous in this thread
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          This member participates here under a per-thread pseudonym. Their
          identity, profile, and activity elsewhere stay private.
        </p>
        <button
          type="button"
          onClick={() => router.push(postPathForId(threadId))}
          className="mt-2 text-left text-xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
        >
          Thread: {activity.threadTitle}
        </button>
      </header>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-muted">
          Activity in this thread
        </h2>
        <ul className="space-y-2">
          {activity.items.map((item, i) => (
            <li
              key={i}
              className="rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <div className="flex items-center gap-1.5 text-xs text-muted">
                {item.kind === "post" ? (
                  <Feather size={12} aria-hidden />
                ) : (
                  <MessageSquare size={12} aria-hidden />
                )}
                <span className="capitalize">{item.kind}</span>
                {item.ts ? <span>• {relTime(item.ts, NOW)}</span> : null}
                <span className="ml-auto">
                  {item.up} agree · {item.down} disagree
                </span>
              </div>
              <div className="mt-1 space-y-1 text-sm text-ink-soft">
                {item.body.map((line, li) => (
                  <p key={li}>{line}</p>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
