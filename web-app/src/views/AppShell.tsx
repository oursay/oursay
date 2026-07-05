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
  ChooseSignModal,
  ComposeFlow,
  Fab,
  FilterDropdown,
  JurisdictionSelector,
  LoginChooser,
  OtpVerify,
  ProfileModal,
  RegisterForm,
  SafeFooter,
  ShareModal,
  SignModal,
} from "@/components";
import { DismissBackdrop, NotificationToast } from "@/components/ui";
import { MY_HANDLE, MY_NAME } from "@/lib/mock";
import { rootTypesForJurisdiction } from "@/lib/compose-eligibility";
import { jurisdictionWidePost, resolveGeography } from "@/lib/read-model";
import { scopedFeedFilterFromState } from "@/lib/state";
import type { RecordKind } from "@/lib/types";
import {
  jurisdictionPath,
  jurisdictionPillLabel,
  pageTitle,
  SELF_PROFILE_PATH,
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
    state.myJurisdiction !== "off" ||
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
  // Chrome-only scoped filter: carries the active view's district universe
  // (pageJurisdiction-aware) — never used for fetching (see lib/state/filters).
  const scopedFilter = scopedFeedFilterFromState(state);
  const geo = resolveGeography(scopedFilter, app.viewer, openPostBearing);
  const showAffected = openPostBearing != null && !geo.interlocked;

  // My Jurisdiction row: needs a district-bearing jurisdiction scope (the
  // resolved universe is empty when e.g. Global is in the feed — there the
  // filter mirrors Verified: Residency) and, on a post, a post that is NOT
  // jurisdiction-wide (there it mirrors Affected; affected > jurisdiction).
  const jurisdictionDistricts =
    scopedFilter.geography?.jurisdictionDistricts ?? [];
  const showMyJurisdiction =
    jurisdictionDistricts.length > 0 &&
    (view === "post"
      ? openPostBearing != null &&
        !jurisdictionWidePost(openPostBearing.districts, jurisdictionDistricts)
      : hasCardList);

  const composeJur = state.composeJur ?? "Global";
  const allowedComposeTypes = rootTypesForJurisdiction(composeJur);

  // The single jurisdiction the top bar currently displays, if any: an open
  // jurisdiction/district/post carries its own scope; a feed shows one only
  // when a single subscription is included. Used to skip the compose "where".
  const inferredComposeJurisdiction =
    (view === "jurisdiction" || view === "district" || view === "post") &&
    state.pageJurisdiction
      ? state.pageJurisdiction
      : includedSubs.length === 1
        ? includedSubs[0]
        : undefined;

  const accountSlot = state.loggedIn ? (
    // Mirrors the filter button's footprint; the avatar covers the full circle.
    <button
      type="button"
      aria-label="Account"
      onClick={app.openProfile}
      className="inline-flex size-10 items-center justify-center overflow-hidden rounded-full border border-border-strong shadow-sm hover:opacity-90"
    >
      <Avatar name={MY_NAME} seed={MY_HANDLE} size="sm" className="size-10!" />
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
              onJurisdictionLabelClick={() => {
                if (state.jurSelectorOpen) app.toggleJurSelector();
                if (view !== "feed") router.push("/feed");
              }}
              onJurisdictionCaretClick={app.toggleJurSelector}
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
                  myDistricts={
                    geo.myDistrictsImplied ? "inclusive" : state.myDistricts
                  }
                  onCycleMyDistricts={app.cycleMyDistricts}
                  singleJurisdiction={inferredComposeJurisdiction !== undefined}
                  signedFilter={state.signedFilter}
                  onCycleSignedFilter={app.cycleSignedFilter}
                  showAffected={showAffected}
                  affected={geo.affectedImplied ? "inclusive" : state.affected}
                  onCycleAffected={app.cycleAffected}
                  showMyJurisdiction={showMyJurisdiction}
                  myJurisdiction={
                    geo.jurisdictionImplied ? "exclusive" : state.myJurisdiction
                  }
                  onCycleMyJurisdiction={app.cycleMyJurisdiction}
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
          <Fab onClick={() => app.startCompose(inferredComposeJurisdiction)} />
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
        handle={MY_HANDLE}
        kycTier={state.kycTier}
        accountVisibility={state.accountVisibility}
        onChangeVisibility={app.setAccountVisibility}
        onViewProfile={() => {
          app.closeProfile();
          router.push(SELF_PROFILE_PATH);
        }}
        onValidateId={app.cycleKyc}
        onLogout={app.logout}
        devices={state.devices}
        onAddDevice={app.addDevice}
        onAddDeviceByEmail={app.addDeviceByEmail}
        theme={state.theme}
        onToggleTheme={app.toggleTheme}
        signing={state.signing}
        onSetSigning={app.setSigning}
        onSetPostSigning={app.setPostSigning}
        onOpenSetting={(label) => app.notify(`${label} is not built in this demo.`)}
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
        onChangeJurisdiction={app.changeComposeJurisdiction}
        accountVisibility={state.accountVisibility}
        composeVisibility={state.composeVisibility}
        onSelectVisibility={app.setComposeVisibility}
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
        isFinal={state.sign?.isFinal ?? false}
        jurisdiction={state.sign?.jurisdiction}
        showResidencyNotice={state.sign?.showResidencyNotice ?? false}
        showAffectedNotice={state.sign?.showAffectedNotice ?? false}
        onConfirm={app.confirmSign}
      />
      <ChooseSignModal
        open={state.choose !== null}
        onClose={app.closeChoose}
        title={state.choose?.title ?? ""}
        lines={state.choose?.lines ?? []}
        onQuickSign={app.confirmChoose}
        onPasskeySign={app.confirmChoose}
      />
      <AddJurisdictionModal
        open={state.addJurOpen}
        onClose={app.closeAddJur}
        subscriptions={state.subscriptions}
        onJoin={app.addJurisdiction}
        onDelete={app.removeJurisdiction}
      />
      <ShareModal
        open={state.share !== null}
        onClose={app.closeShare}
        target={state.share}
        onNotify={app.notify}
        onShared={() => {
          if (state.share) app.recordShare(state.share.shareKey);
        }}
        onReport={() => {
          app.closeShare();
          app.notify("Report submitted — our team will review it (demo).");
        }}
      />

      {state.toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center px-3">
          <NotificationToast message={state.toast} onDismiss={app.dismissToast} />
        </div>
      ) : null}
    </>
  );
}
