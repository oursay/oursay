"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { User } from "lucide-react";
import {
  AddJurisdictionModal,
  AppFrame,
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
  SignModal,
} from "@/components";
import { MY_NAME } from "@/lib/mock";
import type { RecordKind } from "@/lib/types";
import {
  VIEW_TITLE,
  jurisdictionPath,
  jurisdictionPillLabel,
  viewFromPathname,
} from "@/lib/routes";
import { useApp } from "@/lib/state";

export function AppShell({ children }: { children: ReactNode }) {
  const app = useApp();
  const { state } = app;
  const router = useRouter();
  const pathname = usePathname();
  const view = viewFromPathname(pathname);

  const title = VIEW_TITLE[view];
  const hasCardList =
    view === "feed" || view === "jurisdiction" || view === "district";

  useEffect(() => {
    document.title = `OurSay — ${title}`;
  }, [title]);

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

  let jurisdictionLabel = jurisdictionPillLabel(includedSubs);
  if (
    (view === "jurisdiction" || view === "district") &&
    state.pageJurisdiction
  ) {
    jurisdictionLabel = state.pageJurisdiction;
  }

  const filterActive =
    state.verified > 0 ||
    state.myDistricts ||
    state.affected ||
    (hasCardList && state.includedKinds.length < 4);

  const alberta = state.composeJur === "Alberta";
  const allowedComposeTypes: RecordKind[] = alberta
    ? ["statement", "petition"]
    : ["statement", "petition", "poll"];
  const lockedComposeTypes: RecordKind[] =
    alberta && state.kycTier < 2 ? ["petition"] : [];

  const accountSlot = state.loggedIn ? (
    <button
      type="button"
      aria-label="Account"
      onClick={app.openProfile}
      className="inline-flex size-10 items-center justify-center rounded-full bg-brand-600 shadow-sm shadow-brand-600/25 hover:bg-brand-700"
    >
      <Avatar
        name={MY_NAME}
        size="sm"
        className="size-7 bg-transparent text-[11px] text-white"
      />
    </button>
  ) : (
    <button
      type="button"
      aria-label="Log in"
      onClick={app.openAuth}
      className="inline-flex size-10 items-center justify-center rounded-full border border-border-strong bg-surface text-ink shadow-sm hover:bg-surface-muted"
    >
      <User size={20} aria-hidden />
    </button>
  );

  const popoverOpen = state.filterOpen || state.jurSelectorOpen;

  return (
    <>
      <AppFrame
        captureActive={popoverOpen}
        onCaptureDismiss={app.closePopovers}
        header={
          <div className="relative">
            <AppHeader
              jurisdictionLabel={jurisdictionLabel}
              onJurisdictionClick={app.toggleJurSelector}
              onFilterClick={app.toggleFilter}
              filterActive={filterActive}
              accountSlot={accountSlot}
            />

            {state.filterOpen ? (
              <div className="absolute left-3 top-full z-40 mt-1">
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

            {state.jurSelectorOpen ? (
              <div className="absolute inset-x-0 top-full z-40 mt-1 flex justify-center px-3">
                <JurisdictionSelector
                  subscriptions={state.subscriptions}
                  onToggleInclude={app.toggleSub}
                  onSelectOnly={(name) => {
                    app.selectOnlySub(name);
                    app.toggleJurSelector();
                    router.push("/feed");
                  }}
                  onOpenJurisdiction={(name) => {
                    app.toggleJurSelector();
                    router.push(jurisdictionPath(name));
                  }}
                  onAddJurisdiction={app.openAddJur}
                />
              </div>
            ) : null}
          </div>
        }
        footer={<SafeFooter />}
        fab={
          <Fab
            variant={view === "feed" ? "compose" : "home"}
            onClick={
              view === "feed" ? app.startCompose : () => router.push("/feed")
            }
          />
        }
      >
        {children}
      </AppFrame>

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
    </>
  );
}
