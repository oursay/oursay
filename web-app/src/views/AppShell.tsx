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
import { DismissBackdrop, NotificationToast } from "@/components/ui";
import { MY_NAME } from "@/lib/mock";
import { rootTypesForJurisdiction } from "@/lib/compose-eligibility";
import { resolveGeography } from "@/lib/read-model";
import type { RecordKind } from "@/lib/types";
import {
  jurisdictionPath,
  jurisdictionPillLabel,
  pageTitle,
  viewFromPathname,
} from "@/lib/routes";
import { useApp } from "@/lib/state";

export function AppShell({ children }: { children: ReactNode }) {
  const app = useApp();
  const { state } = app;
  const router = useRouter();
  const pathname = usePathname();
  const view = viewFromPathname(pathname);

  const title = pageTitle(pathname);
  const hasCardList =
    view === "feed" || view === "jurisdiction" || view === "district";
  const isProfile = view === "profile";

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

  let jurisdictionLabel = jurisdictionPillLabel(
    includedSubs,
    state.subscriptions.length,
  );
  if (
    (view === "jurisdiction" || view === "district" || view === "post") &&
    state.pageJurisdiction
  ) {
    jurisdictionLabel = state.pageJurisdiction;
  }

  const filterActive =
    state.verified > 0 ||
    state.myDistricts !== "off" ||
    state.affected !== "off" ||
    state.signedFilter > 0 ||
    (hasCardList && state.includedKinds.length < 4) ||
    (isProfile && state.profileTypes.length < 5);

  // Post-page geography context: the Affected row shows on any open post
  // EXCEPT one that only relates to my own districts (interlocked — it would
  // be the same filter as My Districts). The exclusive-conflict auto-disable
  // is resolved against the same context.
  const openPostBearing =
    view === "post" && state.postDistricts
      ? { districts: state.postDistricts }
      : null;
  const geo = resolveGeography(app.feedFilter, app.viewer, openPostBearing);
  const showAffected = openPostBearing != null && !geo.interlocked;

  const composeJur = state.composeJur ?? "Global";
  const allowedComposeTypes = rootTypesForJurisdiction(composeJur);

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
        dismissCapture={
          <DismissBackdrop
            open={popoverOpen}
            onDismiss={app.closePopovers}
            zIndex={35}
            portaled={false}
          />
        }
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
              <div className="pointer-events-auto absolute left-3 top-full z-40 mt-1">
                <FilterDropdown
                  includedKinds={state.includedKinds}
                  onToggleKind={app.toggleKind}
                  onIsolateKind={app.isolateKind}
                  onAllKinds={app.allKinds}
                  verifiedLevel={app.effectiveVerified}
                  onCycleVerified={app.cycleVerified}
                  myDistricts={state.myDistricts}
                  onCycleMyDistricts={app.cycleMyDistricts}
                  signedFilter={state.signedFilter}
                  onCycleSignedFilter={app.cycleSignedFilter}
                  showAffected={showAffected}
                  affected={state.affected}
                  onCycleAffected={app.cycleAffected}
                  geoAutoDisabled={geo.autoDisabled}
                  showRecordTypes={hasCardList}
                  showActivityTypes={isProfile}
                  profileTypes={state.profileTypes}
                  onToggleProfileType={app.toggleProfileType}
                  onIsolateProfileType={app.isolateProfileType}
                  onAllProfileTypes={app.allProfileTypes}
                  showSigned={!isProfile}
                  viewer={app.viewer}
                />
              </div>
            ) : null}

            {state.jurSelectorOpen ? (
              <div className="pointer-events-none absolute inset-x-0 top-full z-40 mt-1 flex justify-center px-3">
                <div className="pointer-events-auto">
                  <JurisdictionSelector
                    subscriptions={state.subscriptions}
                    onToggleInclude={app.toggleSub}
                    onAllJurisdictions={() => {
                      app.allSubs();
                      app.toggleJurSelector();
                      router.push("/feed");
                    }}
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
        kycTier={state.kycTier}
        selectedJurisdiction={state.composeJur}
        onSelectJurisdiction={app.selectComposeJurisdiction}
        allowedTypes={allowedComposeTypes}
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
        subscriptions={state.subscriptions}
        onJoin={app.addJurisdiction}
        onDelete={app.removeJurisdiction}
      />

      {state.toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center px-3">
          <NotificationToast message={state.toast} onDismiss={app.dismissToast} />
        </div>
      ) : null}
    </>
  );
}
