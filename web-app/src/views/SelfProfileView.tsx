"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui";
import { MY_HANDLE } from "@/lib/mock";
import { readSession, useApp } from "@/lib/state";
import { ProfileView } from "./ProfileView";

/**
 * The signed-in account's own public profile (/profile/self). Logged out it
 * auto-opens the auth chooser once, leaving a message + reopen button behind
 * the modal.
 */
export function SelfProfileView() {
  const app = useApp();
  const { loggedIn } = app.state;
  const { openAuth, setPageJurisdiction } = app;

  // Ref-guarded so the modal pops only on arrival — logging out while on the
  // page must not re-open it. state.loggedIn is stale-false until the
  // provider's cookie hydration effect runs (after this child effect), so
  // consult the persisted session directly before popping the modal.
  const autoOpened = useRef(false);
  useEffect(() => {
    setPageJurisdiction(null);
    if (autoOpened.current) return;
    autoOpened.current = true;
    if (!loggedIn && !readSession().loggedIn) openAuth();
  }, [loggedIn, openAuth, setPageJurisdiction]);

  if (!loggedIn) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-sm text-muted">
          Log in to view and manage your profile.
        </p>
        <Button onClick={openAuth}>Log in or Register</Button>
      </div>
    );
  }

  return <ProfileView handle={MY_HANDLE} self />;
}
