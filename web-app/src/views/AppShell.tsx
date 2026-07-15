"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { User } from "lucide-react";
import {
  AddJurisdictionModal,
  AppFrame,
  AppHeader,
  AuthChooser,
  Avatar,
  ChooseSignModal,
  ComposeFlow,
  DemoBanner,
  DonationBanner,
  DonationModal,
  EditProfileModal,
  Fab,
  FilterDropdown,
  JurisdictionSelector,
  LoginChooser,
  OtpVerify,
  ProfileModal,
  RecoverForm,
  RecoveryKycModal,
  RegisterForm,
  SafeFooter,
  ShareModal,
  VerifyModal,
} from "@/components";
import type { VerifyChoice } from "@/components";
import { DismissBackdrop, NotificationToast } from "@/components/ui";
import { jurisdictionLabel as labelForJurisdiction } from "@/lib/mock";
import { GLOBAL_ID } from "@/lib/types";
import { rootTypesForJurisdiction } from "@/lib/compose-eligibility";
import { jurisdictionWidePost, resolveGeography } from "@/lib/read-model";
import { accountIdentity, authEmailOf, scopedFeedFilterFromState, useApp } from "@/lib/state";
import type { RecordKind } from "@/lib/types";
import {
  jurisdictionPath,
  jurisdictionPillLabel,
  pageTitle,
  SELF_PROFILE_PATH,
  viewFromPathname,
} from "@/lib/routes";
import { isMockOnly } from "@/lib/api/client";
import { requestLoginOtp, requestRecoveryOtp, requestRegistrationOtp } from "@/lib/api/auth";
import { loadRegistrationDraft, registrationProfileForApi } from "@/lib/state/registration-draft";
import {
  DEFERRED_JURISDICTIONS_SETTINGS,
  DEFERRED_LEGAL,
  DEFERRED_PASSKEY_RECOVERY,
} from "@/lib/api/deferred";
import {
  donationsSurfacesEnabled,
  getSponsorsUrl,
  markPublicDonationAskShown,
  openGitHubSponsors,
  PUBLIC_DONATION_DELAY_MS,
  resolveFabBanner,
  shouldOfferPublicDonationAsk,
  SHOW_DONATION_MODAL_KYC,
  SHOW_DONATION_MODAL_PUBLIC,
} from "@/lib/donations";
import {
  markVerifyAskShown,
  shouldOfferVerifyAsk,
  VERIFY_ASK_DELAY_MS,
} from "@/lib/kyc/verifyAsk";
import { tierMatchedVerifyChoice } from "@/lib/kyc/tierUpdate";
import { MY_HANDLE, MY_NAME } from "@/lib/mock/constants";
type DonationOpen = "public" | "kyc" | null;
type PendingKyc =
  | { kind: "verify"; choice: VerifyChoice }
  | { kind: "recovery" }
  | null;

export function AppShell({ children }: { children: ReactNode }) {
  const app = useApp();
  const { state } = app;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const otpEmailParam = searchParams.get("otpEmail");
  const otpPurposeParam = searchParams.get("otpPurpose");
  const handledOtpEmailRef = useRef<string | null>(null);
  const view = viewFromPathname(pathname);
  const account = accountIdentity(state);
  const authModal = state.authModal;
  const otpMode = authModal.kind === "otp" ? authModal.flow : "registration";
  const passkeyBusy = state.passkeyBusy;
  const otpPasskeyBusy = passkeyBusy?.anchor === "otp" ? passkeyBusy.phase : null;
  const loginPasskeyBusy = passkeyBusy?.anchor === "login" ? passkeyBusy.phase : null;
  const profilePasskeyBusy = passkeyBusy?.anchor === "profile" ? passkeyBusy.phase : null;
  const choosePasskeyBusy = passkeyBusy?.anchor === "choose" ? passkeyBusy.phase : null;

  const [donationOpen, setDonationOpen] = useState<DonationOpen>(null);
  const [pendingKyc, setPendingKyc] = useState<PendingKyc>(null);
  const fabBanner = resolveFabBanner();

  const loggedInRef = useRef(state.loggedIn);
  const kycTierRef = useRef(state.kycTier);
  const authKindRef = useRef(authModal.kind);
  const donationOpenRef = useRef(donationOpen);
  const profileOpenRef = useRef(state.profileOpen);
  const verifyOpenRef = useRef(state.verifyOpen);
  const composeOpenRef = useRef(state.composeOpen);
  const openVerifyRef = useRef(app.openVerify);
  loggedInRef.current = state.loggedIn;
  kycTierRef.current = state.kycTier;
  authKindRef.current = authModal.kind;
  donationOpenRef.current = donationOpen;
  profileOpenRef.current = state.profileOpen;
  verifyOpenRef.current = state.verifyOpen;
  composeOpenRef.current = state.composeOpen;
  openVerifyRef.current = app.openVerify;

  /** Guest soft-ask: once per 24h, after 30s on the page (skips while other chrome modals are open). */
  useEffect(() => {
    if (!SHOW_DONATION_MODAL_PUBLIC || state.loggedIn) return;
    if (!shouldOfferPublicDonationAsk()) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const readyAt = Date.now() + PUBLIC_DONATION_DELAY_MS;

    const tick = () => {
      if (cancelled || loggedInRef.current) return;
      if (Date.now() < readyAt) {
        timeoutId = setTimeout(tick, 500);
        return;
      }
      if (donationOpenRef.current) return;
      const chromeBusy =
        authKindRef.current !== "none" ||
        profileOpenRef.current ||
        verifyOpenRef.current ||
        composeOpenRef.current;
      if (chromeBusy) {
        timeoutId = setTimeout(tick, 1_000);
        return;
      }
      setDonationOpen("public");
    };

    timeoutId = setTimeout(tick, 500);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [state.loggedIn]);

  /**
   * Unverified members: Get Verified soft-ask once per 24h after login
   * (skips while other chrome modals are open).
   */
  useEffect(() => {
    if (!state.loggedIn || state.kycTier !== 0) return;
    if (!shouldOfferVerifyAsk()) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const readyAt = Date.now() + VERIFY_ASK_DELAY_MS;

    const tick = () => {
      if (cancelled || !loggedInRef.current || kycTierRef.current !== 0) return;
      if (Date.now() < readyAt) {
        timeoutId = setTimeout(tick, 250);
        return;
      }
      if (donationOpenRef.current || verifyOpenRef.current) return;
      const chromeBusy =
        authKindRef.current !== "none" ||
        profileOpenRef.current ||
        composeOpenRef.current;
      if (chromeBusy) {
        timeoutId = setTimeout(tick, 1_000);
        return;
      }
      if (!shouldOfferVerifyAsk()) return;
      markVerifyAskShown();
      openVerifyRef.current();
    };

    timeoutId = setTimeout(tick, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [state.loggedIn, state.kycTier]);

  const openPublicDonate = () => {
    if (SHOW_DONATION_MODAL_PUBLIC) {
      setDonationOpen("public");
      return;
    }
    openGitHubSponsors();
  };

  const openProfileDonate = () => {
    if (SHOW_DONATION_MODAL_PUBLIC || SHOW_DONATION_MODAL_KYC) {
      setDonationOpen("public");
      return;
    }
    openGitHubSponsors();
  };

  const closeDonation = () => {
    if (donationOpen === "public") {
      markPublicDonationAskShown();
    }
    setDonationOpen(null);
    setPendingKyc(null);
  };

  const continueAfterDonation = () => {
    const pending = pendingKyc;
    setDonationOpen(null);
    setPendingKyc(null);
    if (!pending) return;
    if (pending.kind === "verify") {
      void app.chooseVerify(pending.choice);
      return;
    }
    void app.startRecoveryKyc();
  };

  const startVerifyChoice = (choice: VerifyChoice) => {
    if (SHOW_DONATION_MODAL_KYC) {
      setPendingKyc({ kind: "verify", choice });
      setDonationOpen("kyc");
      return;
    }
    void app.chooseVerify(choice);
  };

  const openTierMatchedUpdate = () => {
    const choice = tierMatchedVerifyChoice(state.kycTier);
    if (!choice) return;
    app.closeProfile();
    startVerifyChoice(choice);
  };

  const resendOtp = () => {
    const email = authEmailOf(authModal)?.trim();
    if (!email) {
      app.notify("Email was lost — close this dialog and try again.");
      return;
    }

    if (isMockOnly()) {
      app.notify("A new code has been sent (demo).");
      return;
    }

    void (async () => {
      try {
        if (otpMode === "recovery") {
          await requestRecoveryOtp(email);
          app.notify("A new recovery code has been sent — check API server console in dev.");
          return;
        }
        if (otpMode === "login") {
          await requestLoginOtp(email);
          app.notify("A new sign-in code has been sent — check API server console in dev.");
          return;
        }
        const draft = loadRegistrationDraft();
        const profile =
          draft?.email?.trim().toLowerCase() === email.toLowerCase() && draft.handle?.trim()
            ? registrationProfileForApi(draft)
            : undefined;
        await requestRegistrationOtp(email, profile);
        app.notify("A new verification code has been sent — check API server console in dev.");
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : "Resend failed.";
        app.notify(msg);
      }
    })();
  };

  const title = pageTitle(pathname);
  const hasCardList =
    view === "feed" || view === "jurisdiction" || view === "district";
  const isProfile = view === "profile";

  useEffect(() => {
    document.title = `OurSay — ${title}`;
  }, [title]);

  // Deep-link: `?otpEmail=` (+ optional `otpPurpose=registration`) opens Verify Your Email.
  useEffect(() => {
    if (!otpEmailParam) return;
    if (state.loggedIn) return;
    const handledKey = `${otpPurposeParam ?? "login"}:${otpEmailParam}`;
    if (handledOtpEmailRef.current === handledKey) return;

    handledOtpEmailRef.current = handledKey;
    if (otpPurposeParam === "registration") {
      app.openRegistrationOtpByEmail(otpEmailParam);
    } else {
      app.openLoginOtpWindowByEmail(otpEmailParam);
    }

    const next = new URLSearchParams(searchParams.toString());
    next.delete("otpEmail");
    next.delete("otpPurpose");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [otpEmailParam, otpPurposeParam, pathname, router, searchParams, state.loggedIn, app]);

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

  const includedSubIds = state.subscriptions
    .filter((s) => s.included)
    .map((s) => s.id);
  const includedSubLabels = includedSubIds.map(labelForJurisdiction);

  let jurisdictionLabel = jurisdictionPillLabel(
    includedSubLabels,
    state.subscriptions.length,
  );
  if (
    (view === "jurisdiction" || view === "district" || view === "post") &&
    state.pageJurisdiction
  ) {
    jurisdictionLabel = labelForJurisdiction(state.pageJurisdiction);
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

  const composeJur = state.composeJur ?? GLOBAL_ID;
  const allowedComposeTypes = rootTypesForJurisdiction(composeJur);

  // The single jurisdiction the top bar currently displays, if any: an open
  // jurisdiction/district/post carries its own scope; a feed shows one only
  // when a single subscription is included. Used to skip the compose "where".
  const inferredComposeJurisdiction =
    (view === "jurisdiction" || view === "district" || view === "post") &&
    state.pageJurisdiction
      ? state.pageJurisdiction
      : includedSubIds.length === 1
        ? includedSubIds[0]
        : undefined;

  const accountSlot = state.loggedIn ? (
    // Mirrors the filter button's footprint; the avatar covers the full circle.
    <button
      type="button"
      aria-label="Account"
      onClick={app.openProfile}
      className="inline-flex size-10 items-center justify-center overflow-hidden rounded-full border border-border-strong shadow-sm hover:opacity-90"
    >
      <Avatar
        name={account?.name ?? "Account"}
        seed={account?.handle ?? "account"}
        iconType={state.accountIconType}
        size="sm"
        className="size-10!"
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
          <>
            {fabBanner === "demo" ? <DemoBanner /> : null}
            {fabBanner === "donation" ? (
              <DonationBanner onOpenDonate={openPublicDonate} />
            ) : null}
            <Fab onClick={() => app.startCompose(inferredComposeJurisdiction)} />
          </>
        }
      >
        {children}
      </AppFrame>

      <AuthChooser
        open={authModal.kind === "chooser"}
        onClose={app.closeAuth}
        onRegister={app.goRegister}
        onLogin={app.goLogin}
        onRecover={app.recover}
      />
      <RecoverForm
        open={authModal.kind === "recover"}
        onClose={() => app.closeAuth()}
        onSubmit={app.submitRecovery}
        email={authEmailOf(authModal)}
      />
      <RegisterForm
        open={authModal.kind === "register"}
        onClose={() => app.closeAuth()}
        onSubmit={app.submitRegister}
      />
      <OtpVerify
        open={authModal.kind === "otp"}
        onClose={() => app.closeAuth()}
        email={authEmailOf(authModal)}
        onRegisterPasskey={app.completeOtp}
        mode={otpMode}
        onResend={resendOtp}
        passkeyBusy={otpPasskeyBusy}
      />
      <LoginChooser
        open={authModal.kind === "login"}
        onClose={() => app.closeAuth()}
        otpWindow={authModal.kind === "login" && authModal.otp}
        email={authEmailOf(authModal)}
        onPasskeyLogin={app.loginPasskey}
        onVerifyEmail={app.loginVerifyEmail}
        onRecover={app.recover}
        passkeyBusy={loginPasskeyBusy}
      />
      <ProfileModal
        open={state.profileOpen}
        onClose={app.closeProfile}
        name={account?.name ?? "Account"}
        handle={account?.handle ?? ""}
        iconType={state.accountIconType}
        kycTier={state.kycTier}
        accountVisibility={state.accountVisibility}
        onChangeVisibility={app.setAccountVisibility}
        onViewProfile={() => {
          app.closeProfile();
          router.push(SELF_PROFILE_PATH);
        }}
        onValidateId={app.openVerify}
        onLogout={app.logout}
        passkeys={state.passkeys}
        onAddDevice={app.addDevice}
        onAddDeviceByEmail={app.addDeviceByEmail}
        onRenamePasskey={app.renamePasskey}
        onRevokePasskey={app.revokePasskey}
        theme={state.theme}
        onToggleTheme={app.toggleTheme}
        signing={state.signing}
        onSetSigning={app.setSigning}
        onSetPostSigning={app.setPostSigning}
        onDonate={
          donationsSurfacesEnabled() || getSponsorsUrl()
            ? openProfileDonate
            : undefined
        }
        onTierMatchedUpdate={openTierMatchedUpdate}
        onOpenSetting={(label) => {
          if (label === "Edit Profile") {
            app.openEditProfile();
            return;
          }
          if (label === "Jurisdictions") {
            app.notify(
              isMockOnly()
                ? `${label} is not built in this demo.`
                : DEFERRED_JURISDICTIONS_SETTINGS,
            );
            return;
          }
          if (label === "Terms of Service" || label === "Privacy Policy") {
            app.notify(DEFERRED_LEGAL(label));
            return;
          }
          app.notify(`${label} is not built in this demo.`);
        }}
        passkeyBusy={profilePasskeyBusy}
      />
      <VerifyModal
        open={state.verifyOpen}
        onClose={app.closeVerify}
        onChoose={(choice) => {
          startVerifyChoice(choice);
        }}
      />
      <RecoveryKycModal
        open={authModal.kind === "recovery_kyc"}
        onClose={app.closeAuth}
        onStart={() => {
          if (SHOW_DONATION_MODAL_KYC) {
            setPendingKyc({ kind: "recovery" });
            setDonationOpen("kyc");
            return;
          }
          void app.startRecoveryKyc();
        }}
      />
      <DonationModal
        open={donationOpen !== null}
        variant={donationOpen === "kyc" ? "kyc" : "public"}
        onClose={closeDonation}
        onContinue={
          donationOpen === "kyc" && pendingKyc
            ? continueAfterDonation
            : closeDonation
        }
      />
      <ComposeFlow
        open={state.composeOpen}
        onClose={app.closeCompose}
        step={state.composeStep}
        jurisdictions={state.subscriptions.map((s) => s.id)}
        kycTier={state.kycTier}
        role={app.viewer.role}
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
        composeDistricts={state.composeDistricts}
        onComposeDistrictsChange={app.setComposeDistricts}
        composeTitle={state.composeTitle}
        composeBody={state.composeBody}
        composePollOptions={state.composePollOptions}
        onComposeTitleChange={app.setComposeTitle}
        onComposeBodyChange={app.setComposeBody}
        onComposePollOptionsChange={app.setComposePollOptions}
        onPost={app.submitCompose}
      />
      <ChooseSignModal
        open={state.signingConfirm !== null}
        onClose={app.closeSigningConfirm}
        wysiwys={
          state.signingConfirm?.wysiwys ?? {
            title: "",
            technicalRows: [],
            warnings: [],
            jurisdictionId: GLOBAL_ID,
            jurisdictionLabel: "",
          }
        }
        showQuickSign={state.signingConfirm?.showQuickSign ?? false}
        onQuickSign={(remember) => app.confirmSigning("quick", { remember })}
        onPasskeySign={(remember) => app.confirmSigning("passkey", { remember })}
        passkeyBusy={choosePasskeyBusy}
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

      <EditProfileModal
        open={state.editProfileOpen}
        onClose={app.closeEditProfile}
        verified={state.kycTier > 0}
        onGetVerified={() => {
          app.closeEditProfile();
          app.openVerify();
        }}
        initial={{
          handle: account?.handle ?? (isMockOnly() ? MY_HANDLE : ""),
          displayName: account?.name ?? (isMockOnly() ? MY_NAME : ""),
          bio: state.accountBio ?? "",
          iconType: state.accountIconType,
        }}
        onSubmit={app.submitEditProfile}
      />

      {state.toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center px-3">
          <NotificationToast message={state.toast} onDismiss={app.dismissToast} />
        </div>
      ) : null}
    </>
  );
}
