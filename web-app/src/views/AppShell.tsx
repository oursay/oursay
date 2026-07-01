"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { User } from "lucide-react";
import {
  AddJurisdictionModal,
  AppHeader,
  AuthChooser,
  Avatar,
  ComposeFlow,
  Fab,
  FilterDropdown,
  JurisdictionSelector,
  LoginChooser,
  OtpVerify,
  ProfileModal,
  RegisterForm,
  SafeFooter,
  ScrollBody,
  SignModal,
} from "@/components";
import { MY_NAME } from "@/lib/mock";
import type { RecordKind } from "@/lib/types";
import {
  VIEW_TITLE,
  jurisdictionPath,
  viewFromPathname,
} from "@/lib/routes";
import { useApp } from "@/lib/state";

/** Feed scope label for the header pill (one name, or the unified-feed label). */
function feedScopeLabel(included: string[]): string {
  if (included.length === 1) return included[0];
  return "Unified feed";
}

export function AppShell({ children }: { children: ReactNode }) {
  const app = useApp();
  const { state } = app;
  const router = useRouter();
  const pathname = usePathname();
  const view = viewFromPathname(pathname);

  const title = VIEW_TITLE[view];
  const hasCardList =
    view === "feed" || view === "jurisdiction" || view === "district";

  // Keep the browser tab title in sync with the active view.
  useEffect(() => {
    document.title = `OurSay — ${title}`;
  }, [title]);

  // Dev-only shortcuts: F toggles the filter, O toggles the OTP login window.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "f" || e.key === "F") app.toggleFilter();
      if (e.key === "o" || e.key === "O") app.toggleLoginOtpWindow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app]);

  const includedSubs = state.subscriptions
    .filter((s) => s.included)
    .map((s) => s.name);

  // Header jurisdiction pill: the feed opens the scope selector; jurisdiction /
  // district views name their place and navigate to it.
  let jurisdictionLabel: string | undefined;
  let onJurisdictionClick: (() => void) | undefined;
  if (view === "feed") {
    jurisdictionLabel = feedScopeLabel(includedSubs);
    onJurisdictionClick = app.toggleJurSelector;
  } else if (
    (view === "jurisdiction" || view === "district") &&
    state.pageJurisdiction
  ) {
    const name = state.pageJurisdiction;
    jurisdictionLabel = name;
    onJurisdictionClick = () => router.push(jurisdictionPath(name));
  }

  const filterActive =
    state.verified > 0 ||
    state.myDistricts ||
    state.affected ||
    (hasCardList && state.includedKinds.length < 4);

  // Compose type options depend on the selected jurisdiction (Alberta has no
  // standalone poll — it exists only by petition graduation; petition is
  // residency-gated).
  const alberta = state.composeJur === "Alberta";
  const allowedComposeTypes: RecordKind[] = alberta
    ? ["statement", "petition"]
    : ["statement", "petition", "poll"];
  const lockedComposeTypes: RecordKind[] =
    alberta && state.kycTier < 2 ? ["petition"] : [];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-paper">
      <div className="relative">
        <AppHeader
          title={title}
          jurisdictionLabel={jurisdictionLabel}
          onJurisdictionClick={onJurisdictionClick}
          onFilterClick={app.toggleFilter}
          filterActive={filterActive}
          avatarSlot={
            state.loggedIn ? (
              <button
                type="button"
                aria-label="Account"
                onClick={app.openProfile}
                className="rounded-full"
              >
                <Avatar name={MY_NAME} size="sm" />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Log in"
                onClick={app.openAuth}
                className="inline-flex size-10 items-center justify-center rounded-full text-ink-soft hover:bg-surface-muted"
              >
                <User size={18} aria-hidden />
              </button>
            )
          }
        />

        {state.filterOpen ? (
          <div className="absolute right-3 top-full z-40 mt-1">
            <FilterDropdown
              includedKinds={state.includedKinds}
              onToggleKind={app.toggleKind}
              onIsolateKind={app.isolateKind}
              onAllKinds={app.allKinds}
              verifiedLevel={state.verified}
              onCycleVerified={app.cycleVerified}
              myDistricts={state.myDistricts}
              onToggleMyDistricts={app.toggleMyDistricts}
              showAffected={view === "post" && state.postAffectedEligible}
              affected={state.affected}
              onToggleAffected={app.toggleAffected}
              showRecordTypes={hasCardList}
              viewer={app.viewer}
            />
          </div>
        ) : null}

        {state.jurSelectorOpen && view === "feed" ? (
          <div className="absolute left-3 top-full z-40 mt-1">
            <JurisdictionSelector
              subscriptions={state.subscriptions}
              onToggleInclude={app.toggleSub}
              onSelectOnly={app.selectOnlySub}
              onOpenJurisdiction={(name) => {
                app.toggleJurSelector();
                router.push(jurisdictionPath(name));
              }}
              onAddJurisdiction={app.openAddJur}
            />
          </div>
        ) : null}
      </div>

      <ScrollBody>{children}</ScrollBody>
      <SafeFooter />

      <Fab
        variant={view === "feed" ? "compose" : "home"}
        onClick={
          view === "feed" ? app.startCompose : () => router.push("/feed")
        }
      />

      {/* Modal stack — driven entirely by app state. */}
      <AuthChooser
        open={state.authOpen}
        onClose={app.closeAuth}
        onRegister={app.goRegister}
        onLogin={app.goLogin}
        onRecover={app.recover}
      />
      <RegisterForm
        open={state.registerOpen}
        onClose={() => app.closeAuth()}
        onSubmit={app.submitRegister}
      />
      <OtpVerify
        open={state.otpOpen}
        onClose={() => app.closeAuth()}
        onRegisterPasskey={app.completeOtp}
        onResend={() => app.notify("A new code has been sent (demo).")}
      />
      <LoginChooser
        open={state.loginOpen}
        onClose={() => app.closeAuth()}
        otpWindow={state.loginOtpWindow}
        onPasskeyLogin={app.loginPasskey}
        onVerifyEmail={app.loginVerifyEmail}
        onRecover={app.recover}
      />
      <ProfileModal
        open={state.profileOpen}
        onClose={app.closeProfile}
        name={MY_NAME}
        handle="alex_morgan"
        kycTier={state.kycTier}
        onValidateId={app.cycleKyc}
        onLogout={app.logout}
      />
      <ComposeFlow
        open={state.composeOpen}
        onClose={app.closeCompose}
        step={state.composeStep}
        jurisdictions={state.subscriptions.map((s) => s.name)}
        selectedJurisdiction={state.composeJur}
        onSelectJurisdiction={app.selectComposeJurisdiction}
        allowedTypes={allowedComposeTypes}
        lockedTypes={lockedComposeTypes}
        selectedType={state.composeType}
        onSelectType={app.selectComposeType}
        onChangeType={app.changeComposeType}
        onPost={app.submitCompose}
      />
      <SignModal
        open={state.sign !== null}
        onClose={app.closeSign}
        kind={state.sign?.kind ?? "petition"}
        signerName={MY_NAME}
        targetTitle={state.sign?.targetTitle ?? ""}
        option={state.sign?.option}
        composeTypeLabel={state.sign?.composeTypeLabel}
        showResidencyNotice={state.sign?.showResidencyNotice ?? false}
        showAffectedNotice={state.sign?.showAffectedNotice ?? false}
        onConfirm={app.confirmSign}
      />
      <AddJurisdictionModal
        open={state.addJurOpen}
        onClose={app.closeAddJur}
        onJoin={app.addJurisdiction}
      />

      {state.toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div className="pointer-events-auto max-w-md rounded-full bg-ink px-4 py-2 text-center text-sm font-medium text-white shadow-lg">
            {state.toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}
