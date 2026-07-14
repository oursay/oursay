"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui";
import { accountIdentity, useApp } from "@/lib/state";
import { ProfileView } from "./ProfileView";

/**
 * The signed-in account's own public profile (/profile/self). Logged out it
 * auto-opens the auth chooser once, leaving a message + reopen button behind
 * the modal. Waits for session hydration so a refresh does not flash the
 * chooser before a live session resolves.
 */
export function SelfProfileView() {
  const app = useApp();
  const { loggedIn, authReady } = app.state;
  const { openAuth, setPageJurisdiction } = app;
  const identity = accountIdentity(app.state);

  // Ref-guarded so the modal pops only on arrival — logging out while on the
  // page must not re-open it. Skip until authReady so pre-hydration
  // loggedIn=false does not open the chooser.
  const autoOpened = useRef(false);
  useEffect(() => {
    setPageJurisdiction(null);
  }, [setPageJurisdiction]);

  useEffect(() => {
    if (!authReady || autoOpened.current) return;
    autoOpened.current = true;
    if (!loggedIn) openAuth();
  }, [authReady, loggedIn, openAuth]);

  if (!authReady) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-sm text-muted">Loading profile…</p>
      </div>
    );
  }

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

  if (!identity) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-sm text-muted">Loading profile…</p>
      </div>
    );
  }

  return <ProfileView handle={identity.handle} self />;
}
