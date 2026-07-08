"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type {
  ActivityKind,
  AuthorVisibility,
  FeedFilterParams,
  JurisdictionMembership,
  RecordKind,
  SignAction,
  SignMethod,
  VerificationTier,
  ViewerContext,
} from "@/lib/types";
import {
  ALBERTA_ID,
  DEFAULT_SIGNING,
  GLOBAL_ID,
  POST_SUB_ACTIONS,
  effectiveSignMethod,
  postActionForKind,
} from "@/lib/types";
import {
  MY_DISTRICTS,
  MY_HANDLE,
  jurisdictionLabel,
  jurisdictionSignRequirement,
} from "@/lib/mock";
import {
  outsideMyDistricts,
  personaNameFor,
  pinnedTierMin,
  resolveGeography,
  resolveVisibility,
} from "@/lib/read-model";
import type { ResolvedGeography } from "@/lib/read-model";
import { RECORD_TYPE_LABEL } from "@/components/content";
import type { SignKind } from "@/components";
import { nextSignedFilterLevel } from "@/lib/types/sign-tier";
import { nextGeoFilterMode } from "@/lib/types";
import { shareBaseCount } from "@/lib/share";
import type {
  AppState,
  ChooseSignRequest,
  ShareTarget,
  SignRequest,
} from "./types";
import {
  feedFilterFromState,
  scopedFeedFilterFromState,
  viewerFromState,
} from "./filters";
import {
  DEFAULT_SUBSCRIPTIONS,
  readSession,
  readSigning,
  readSubscriptions,
  readTheme,
  writeSession,
  writeSigning,
  writeSubscriptions,
  writeTheme,
} from "./cookies";
import { ApiError, isMockOnly } from "@/lib/api/client";
import { wireHandle } from "@/lib/handle";
import type { CivicSignMode } from "@/lib/api/civic-helpers";
import {
  parentTypeForKind,
  reactionKindForDir,
  resolveCivicSignMode,
} from "@/lib/api/civic-helpers";
import type { RegisterFormData } from "@/components/chrome/RegisterForm";
import {
  enrollPasskey,
  listPasskeys,
  loginWithPasskey,
  logout as apiLogout,
  enableLogin,
  requestRegistrationOtp,
  requestRecoveryOtp,
  revokePasskey as apiRevokePasskey,
  updatePasskeyLabel,
  verifyLoginOtp,
  verifyRecoveryOtp,
  verifyRegistrationOtp,
  type AuthPasskey,
} from "@/lib/api/auth";
import {
  applyRecordStates,
  attestResidency,
  devAttestKyc,
  fetchAccountContext,
  getRecordStates,
  patchAccountVisibility,
  patchProfile,
  patchSigningPrefs,
  postShareMark,
  putJurisdictionMemberships,
  putThreadVisibility,
} from "@/lib/api/me";
import type { AddressFormData } from "@/components/chrome/ChangeAddressModal";
import { writeThreadVisibility } from "./cookies";
import {
  clearRegistrationDraft,
  loadRegistrationDraft,
  registrationProfileForApi,
  saveRegistrationDraft,
} from "./registration-draft";
import { isValidEmailFormat } from "@/lib/email";
import { handleValidationError, normalizeHandleBody } from "@/lib/handle";

const ALL_KINDS: RecordKind[] = ["statement", "petition", "poll", "result"];
const ALL_ACTIVITY: ActivityKind[] = [
  "statement",
  "comment",
  "petition",
  "poll",
  "reaction",
];

/** A record shape the civic-write actions need (FeedItem or RecordDetail both fit). */
interface CivicTarget {
  id: string;
  kind?: RecordKind;
  threadId?: string;
  parentType?: "post" | "petition" | "poll" | "comment";
  jurisdiction: string;
  title: string;
  sig?: number;
  up?: number;
  down?: number;
  districts: string[];
}

/** Context for posting a comment or reply in a thread. */
export interface CommentWriteContext {
  threadId: string;
  jurisdiction: string;
  targetTitle: string;
  parentId: string;
  parentType: "post" | "comment";
  body: string;
}

type SignedCommit = (sign: CivicSignMode) => void;

function mockPasskey(label: string, id?: string): AuthPasskey {
  return {
    id: id ?? `mock-${label}`,
    label,
    transports: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: null,
  };
}

const MOCK_PASSKEYS: AuthPasskey[] = [
  mockPasskey("iPhone 15 — this device", "mock-1"),
  mockPasskey("MacBook Pro", "mock-2"),
  mockPasskey("Pixel 8", "mock-3"),
];

/** Pre-hydration defaults (exported for state-derivation tests). */
export const INITIAL_APP_STATE: AppState = {
  loggedIn: false,
  kycTier: 0,
  viewerDistricts: [],
  accountVisibility: "anonymous",
  passkeys: MOCK_PASSKEYS,
  theme: "light",
  signing: DEFAULT_SIGNING,

  includedKinds: [...ALL_KINDS],
  verified: 0,
  myDistricts: "off",
  affected: "off",
  myJurisdiction: "off",
  geoPriority: "myDistricts",
  signedFilter: 0,

  profileTypes: [...ALL_ACTIVITY],

  subscriptions: DEFAULT_SUBSCRIPTIONS,

  filterOpen: false,
  jurSelectorOpen: false,

  authOpen: false,
  registerOpen: false,
  otpOpen: false,
  loginOpen: false,
  loginOtpWindow: false,
  recoveryOtpWindow: false,
  profileOpen: false,
  addJurOpen: false,
  recoverOpen: false,

  composeOpen: false,
  composeStep: "where",
  composeJur: undefined,
  composeType: undefined,
  composeVisibility: undefined,
  composeTitle: "",
  composeBody: "",
  composePollOptions: ["", ""],
  composeDistricts: [],

  sign: null,
  choose: null,
  share: null,

  reactions: {},
  reactionCounts: {},
  votes: {},
  petitionSig: {},
  shared: {},
  shareCounts: {},

  addressOpen: false,

  replyOpen: false,

  pageJurisdiction: null,
  postDistricts: null,

  toast: null,
};

/** Geography resolution against the state's post context (see resolveGeography). */
function resolveGeoFromState(s: AppState): ResolvedGeography {
  return resolveGeography(
    scopedFeedFilterFromState(s),
    viewerFromState(s),
    s.postDistricts ? { districts: s.postDistricts } : null,
  );
}

/**
 * The Verified level display + inference use: pinned to Residency while a
 * geography exclusive is engaged, without touching the remembered selection.
 */
function effectiveVerifiedFor(s: AppState): VerificationTier {
  return pinnedTierMin(s.verified, resolveGeoFromState(s));
}

export interface AppApi {
  state: AppState;
  viewer: ViewerContext;
  feedFilter: FeedFilterParams;
  /**
   * The Verified ladder level in force — state.verified, pinned to Residency
   * while a geography exclusive is engaged. Use this for display and any
   * tierMin-driven rendering; state.verified is only the remembered selection.
   */
  effectiveVerified: VerificationTier;

  // Session (demo — no real auth).
  demoLogin: () => void;
  logout: () => void;
  cycleKyc: () => void;
  requireAuth: (action: () => void) => void;

  // Filter — record types + Verified/geography ladder.
  toggleFilter: () => void;
  closePopovers: () => void;
  toggleKind: (kind: RecordKind) => void;
  isolateKind: (kind: RecordKind) => void;
  allKinds: () => void;
  cycleVerified: () => void;
  cycleMyDistricts: () => void;
  cycleAffected: () => void;
  cycleMyJurisdiction: () => void;
  cycleSignedFilter: () => void;

  // Profile Activity-type filter.
  toggleProfileType: (kind: ActivityKind) => void;
  isolateProfileType: (kind: ActivityKind) => void;
  allProfileTypes: () => void;

  // Jurisdiction selector + subscriptions.
  toggleJurSelector: () => void;
  toggleSub: (name: string) => void;
  selectOnlySub: (name: string) => void;
  allSubs: () => void;
  openAddJur: () => void;
  closeAddJur: () => void;
  addJurisdiction: (name: string) => void;
  removeJurisdiction: (name: string) => void;

  // Auth flow.
  openAuth: () => void;
  closeAuth: () => void;
  goRegister: () => void;
  submitRegister: (data?: RegisterFormData) => void;
  completeOtp: (code?: string) => void;
  goLogin: () => void;
  loginPasskey: () => void;
  loginVerifyEmail: (email: string) => void;
  openLoginOtpWindowByEmail: (email: string) => void;
  toggleLoginOtpWindow: () => void;
  recover: () => void;
  submitRecovery: (data?: { email: string }) => void;
  openProfile: () => void;
  closeProfile: () => void;

  // Profile modal account management.
  addDevice: () => void;
  addDeviceByEmail: () => void;
  renamePasskey: (id: string, label: string) => void;
  revokePasskey: (id: string) => void;
  toggleTheme: () => void;
  /** Set the signing method for one action. */
  setSigning: (action: SignAction, method: SignMethod) => void;
  /** Set the signing method for all three "Post" sub-actions at once. */
  setPostSigning: (method: SignMethod) => void;
  /** Account-default profile visibility (docs/09 cascade base; persisted). */
  setAccountVisibility: (v: AuthorVisibility) => void;

  // Civic interactions (stubbed writes).
  react: (target: CivicTarget, dir: "up" | "down") => void;
  reactionFor: (id: string) => "up" | "down" | null;
  reactionCountsFor: (target: CivicTarget) => { up: number; down: number };
  votePoll: (target: CivicTarget, option: string) => void;
  voteFor: (id: string) => string | null;
  signPetition: (target: CivicTarget) => void;
  petitionSigFor: (target: CivicTarget) => number;
  hasSignedPetition: (id: string) => boolean;
  /** Gate a comment/reply post behind the account's comment signing method. */
  postComment: (ctx: CommentWriteContext, done: (personaName?: string) => void) => void;

  // Compose flow.
  startCompose: (inferredJurisdiction?: string) => void;
  selectComposeJurisdiction: (name: string) => void;
  selectComposeType: (kind: RecordKind) => void;
  changeComposeType: () => void;
  changeComposeJurisdiction: () => void;
  /** Per-post visibility override (defaults to the account level; may widen or narrow). */
  setComposeVisibility: (v: AuthorVisibility) => void;
  setComposeTitle: (v: string) => void;
  setComposeBody: (v: string) => void;
  setComposePollOptions: (v: string[]) => void;
  setComposeDistricts: (slugs: string[]) => void;
  submitCompose: () => void;
  closeCompose: () => void;

  // Alberta sign confirmation.
  confirmSign: () => void;
  closeSign: () => void;

  // "Ask" Quick-vs-Passkey chooser.
  confirmChoose: (sign: CivicSignMode) => void;
  closeChoose: () => void;

  // Post reply composer.
  startReply: () => void;
  closeReply: () => void;

  // Share sheet.
  openShare: (target: ShareTarget) => void;
  closeShare: () => void;
  /** Current share tally for a record/comment (base + the viewer's own share). */
  shareCountFor: (key: string) => number;
  /** Whether the account has already shared this record/comment. */
  hasShared: (key: string) => boolean;
  /** Record a share (once per account) — bumps the tally by one. */
  recordShare: (key: string) => void;

  /** Batch-hydrate reaction/vote/signature/share state from `/v1/me/record-state`. */
  hydrateRecordState: (ids: string[]) => void;
  /** Remember + sync per-thread anonymity (cookie in mock; PUT in live). */
  setThreadVisibility: (threadId: string, visibility: AuthorVisibility) => void;

  // Address + residency (live settings).
  openChangeAddress: () => void;
  closeChangeAddress: () => void;
  submitAddress: (data: AddressFormData) => void;

  // Shared-chrome coordination (set by the active view).
  setPageJurisdiction: (name: string | null) => void;
  setPostDistricts: (districts: string[] | null) => void;

  // "Not built" affordances (edit history, account settings, recovery, …).
  notify: (message: string) => void;
  dismissToast: () => void;
}

/**
 * Every auth-modal flag cleared. Spread into each auth flow so the reset lives in
 * one place; flows that end on a specific modal override the one flag after the
 * spread (e.g. `{ ...AUTH_MODALS_CLOSED, loginOpen: true }`).
 */
const AUTH_MODALS_CLOSED = {
  authOpen: false,
  registerOpen: false,
  otpOpen: false,
  loginOpen: false,
  loginOtpWindow: false,
  recoveryOtpWindow: false,
  recoverOpen: false,
} as const;

const AppContext = createContext<AppApi | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(INITIAL_APP_STATE);
  const pendingCommit = useRef<SignedCommit | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef<string | null>(null);
  const authDraftRef = useRef<RegisterFormData | null>(loadRegistrationDraft());
  // Skip the mount-time session write so it can't clobber the cookie before
  // the persisted values are hydrated in.
  const sessionHydrated = useRef(false);
  const subsHydrated = useRef(false);

  const set = useCallback((patch: Partial<AppState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  // Load persisted subscriptions + session on mount. Live mode hydrates from API.
  useEffect(() => {
    if (isMockOnly()) {
      const session = readSession();
      setState((s) => ({
        ...s,
        subscriptions: readSubscriptions(),
        loggedIn: session.loggedIn,
        kycTier: session.kycTier,
        viewerDistricts: session.kycTier >= 2 ? MY_DISTRICTS : [],
        accountVisibility: session.accountVisibility,
        theme: readTheme(),
        signing: readSigning(),
      }));
      return;
    }
    let active = true;
    fetchAccountContext().then((account) => {
      if (!active) return;
      if (!account) {
        setState((s) => ({
          ...s,
          subscriptions: readSubscriptions(),
          theme: readTheme(),
        }));
        return;
      }
      userIdRef.current = account.userId;
      setState((s) => ({
        ...s,
        loggedIn: true,
        kycTier: account.kycTier,
        viewerDistricts: account.viewerDistricts,
        accountHandle: account.handle,
        accountDisplayName: account.displayName,
        accountVisibility: account.accountVisibility,
        subscriptions: account.subscriptions,
        signing: account.signing,
        theme: readTheme(),
      }));
      void import("@/lib/api/civic-custody").then((m) => m.warmCivicCustody(account.userId));
    });
    return () => {
      active = false;
    };
  }, []);

  // Drive the dark stylesheet: the `dark` class on <html> flips every semantic
  // token (see global.css). Root layout seeds the class server-side from the
  // cookie to avoid a flash, so this only re-syncs on toggle. Persist the
  // choice independently of auth so it survives logout.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
    writeTheme(state.theme);
  }, [state.theme]);

  // Persist signing methods (skip the mount value; the effect above hydrates it).
  const signingHydrated = useRef(false);
  const signingLiveSynced = useRef(false);
  useEffect(() => {
    if (!signingHydrated.current) {
      signingHydrated.current = true;
      return;
    }
    writeSigning(state.signing);
  }, [state.signing]);
  // Skip the mount-time write so it can't clobber the cookie before hydration.
  useEffect(() => {
    if (!subsHydrated.current) {
      subsHydrated.current = true;
      return;
    }
    writeSubscriptions(state.subscriptions);
  }, [state.subscriptions]);
  useEffect(() => {
    if (!isMockOnly()) return;
    if (!sessionHydrated.current) {
      sessionHydrated.current = true;
      return;
    }
    writeSession({
      loggedIn: state.loggedIn,
      kycTier: state.kycTier,
      accountVisibility: state.accountVisibility,
    });
  }, [state.loggedIn, state.kycTier, state.accountVisibility]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setState((s) => ({ ...s, toast: null }));
  }, []);

  const notify = useCallback(
    (message: string) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setState((s) => ({ ...s, toast: message }));
      toastTimer.current = setTimeout(() => {
        setState((s) => ({ ...s, toast: null }));
      }, 2600);
    },
    [],
  );

  // Live signing-prefs sync (after account hydrate skips the first change).
  useEffect(() => {
    if (!signingHydrated.current) return;
    if (isMockOnly() || !state.loggedIn) return;
    if (!signingLiveSynced.current) {
      signingLiveSynced.current = true;
      return;
    }
    void patchSigningPrefs(state.signing).catch((e: Error) => notify(e.message));
  }, [state.signing, state.loggedIn, notify]);

  const closeAllModals = useCallback(() => {
    set({ ...AUTH_MODALS_CLOSED, profileOpen: false, addJurOpen: false });
  }, [set]);

  // --- Session -------------------------------------------------------------
  const demoLogin = useCallback(() => {
    setState((s) => {
      const hasAlberta = s.subscriptions.some((sub) => sub.id === ALBERTA_ID);
      // Accounts start with no registry status (Unverified); the remembered
      // KYC tier is kept if one was already reached this session.
      return {
        ...s,
        loggedIn: true,
        viewerDistricts: s.kycTier >= 2 ? MY_DISTRICTS : [],
        ...AUTH_MODALS_CLOSED,
        subscriptions: hasAlberta
          ? s.subscriptions
          : [...s.subscriptions, { id: ALBERTA_ID, included: true }],
      };
    });
    notify("Signed in (demo). Validate your ID to build up verification.");
  }, [notify]);

  const applyAccount = useCallback(
    (account: Awaited<ReturnType<typeof fetchAccountContext>>) => {
      if (!account) return;
      userIdRef.current = account.userId;
      signingLiveSynced.current = false;
      setState((s) => ({
        ...s,
        loggedIn: true,
        kycTier: account.kycTier,
        viewerDistricts: account.viewerDistricts,
        accountHandle: account.handle,
        accountDisplayName: account.displayName,
        accountVisibility: account.accountVisibility,
        subscriptions: account.subscriptions,
        signing: account.signing,
        ...AUTH_MODALS_CLOSED,
      }));
      if (!isMockOnly()) {
        void import("@/lib/api/civic-custody").then((m) => m.warmCivicCustody(account.userId));
        void listPasskeys()
          .then((passkeys) => setState((s) => ({ ...s, passkeys })))
          .catch((e: Error) => notify(e.message));
      }
    },
    [notify],
  );

  const logout = useCallback(() => {
    const finish = () => {
      userIdRef.current = null;
      if (!isMockOnly()) {
        void import("@/lib/api/civic").then((m) => m.resetCivicClient());
      }
      setState((s) => ({
        ...s,
        loggedIn: false,
        kycTier: 0,
        viewerDistricts: [],
        accountHandle: undefined,
        accountDisplayName: undefined,
        profileOpen: false,
        loginOtpWindow: false,
        recoveryOtpWindow: false,
        recoverOpen: false,
        passkeys: isMockOnly() ? MOCK_PASSKEYS : [],
      }));
      notify("Signed out.");
    };
    if (isMockOnly()) {
      finish();
      return;
    }
    apiLogout().then(finish).catch(() => finish());
  }, [notify]);

  const addDevice = useCallback(() => {
    if (isMockOnly()) {
      setState((s) => ({
        ...s,
        passkeys: [
          ...s.passkeys,
          mockPasskey(`New device (passkey ${s.passkeys.length + 1})`),
        ],
      }));
      notify("Passkey added to this device (demo).");
      return;
    }
    void enrollPasskey()
      .then(() => listPasskeys())
      .then((passkeys) => {
        setState((s) => ({ ...s, passkeys }));
        notify("Passkey added to this device.");
      })
      .catch((e: Error) => notify(e.message));
  }, [notify]);

  // Wireframe addDeviceEmailBtn: opens the account's OTP-login window so a
  // new device can sign in by email and register its own passkey.
  const addDeviceByEmail = useCallback(() => {
    if (isMockOnly()) {
      notify("OTP window opened — log in by email on the new device (demo).");
      return;
    }
    void enableLogin()
      .then((res) => {
        const expiry = new Date(res.expiresAt);
        const expiresCopy = Number.isNaN(expiry.getTime())
          ? ""
          : ` (expires ${expiry.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`;
        notify(
          `Email login enabled — OTP sent${expiresCopy}.${process.env.NODE_ENV === "development" ? " Dev: read the code from the API server console." : ""}`,
        );
      })
      .catch((e: Error) => notify(e.message));
  }, [notify]);

  const renamePasskey = useCallback(
    (id: string, label: string) => {
      const trimmed = label.trim();
      const nextLabel = trimmed || null;
      if (isMockOnly()) {
        setState((s) => ({
          ...s,
          passkeys: s.passkeys.map((pk) =>
            pk.id === id ? { ...pk, label: nextLabel } : pk,
          ),
        }));
        return;
      }
      void updatePasskeyLabel(id, nextLabel)
        .then((passkey) => {
          setState((s) => ({
            ...s,
            passkeys: s.passkeys.map((pk) => (pk.id === id ? passkey : pk)),
          }));
        })
        .catch((e: Error) => notify(e.message));
    },
    [notify],
  );

  const revokePasskey = useCallback(
    (id: string) => {
      if (typeof window !== "undefined" && !window.confirm("Remove this passkey? The device will lose access immediately.")) {
        return;
      }
      if (isMockOnly()) {
        setState((s) => ({ ...s, passkeys: s.passkeys.filter((pk) => pk.id !== id) }));
        return;
      }
      void apiRevokePasskey(id)
        .then(() => listPasskeys())
        .then((passkeys) => {
          setState((s) => ({ ...s, passkeys }));
          notify("Passkey removed.");
        })
        .catch((e: Error) => notify(e.message));
    },
    [notify],
  );

  const toggleTheme = useCallback(() => {
    setState((s) => ({ ...s, theme: s.theme === "light" ? "dark" : "light" }));
  }, []);

  const setSigning = useCallback((action: SignAction, method: SignMethod) => {
    setState((s) => ({
      ...s,
      signing: { ...s.signing, [action]: method },
    }));
  }, []);

  // The "Post" parent switch drives all three compose sub-actions at once.
  const setPostSigning = useCallback((method: SignMethod) => {
    setState((s) => {
      const signing = { ...s.signing };
      for (const action of POST_SUB_ACTIONS) signing[action] = method;
      return { ...s, signing };
    });
  }, []);

  const setAccountVisibility = useCallback((v: AuthorVisibility) => {
    setState((s) => ({ ...s, accountVisibility: v }));
    if (!isMockOnly()) {
      void patchAccountVisibility(v).catch((e: Error) => notify(e.message));
    }
  }, [notify]);

  const cycleKyc = useCallback(() => {
    if (isMockOnly()) {
      setState((s) => {
        const next = ((s.kycTier + 1) % 4) as VerificationTier;
        return {
          ...s,
          kycTier: next,
          viewerDistricts: next >= 2 ? MY_DISTRICTS : [],
        };
      });
      return;
    }
    setState((s) => {
      void devAttestKyc(s.kycTier)
        .then(() => fetchAccountContext())
        .then((account) => {
          if (account) applyAccount(account);
        })
        .catch((e: Error) => notify(e.message));
      return s;
    });
  }, [applyAccount, notify]);

  const openAuth = useCallback(() => {
    set({ ...AUTH_MODALS_CLOSED, authOpen: true });
  }, [set]);

  const requireAuth = useCallback(
    (action: () => void) => {
      if (!state.loggedIn) {
        openAuth();
        return;
      }
      action();
    },
    [state.loggedIn, openAuth],
  );

  // --- Filter --------------------------------------------------------------
  const toggleFilter = useCallback(() => {
    setState((s) => ({ ...s, filterOpen: !s.filterOpen, jurSelectorOpen: false }));
  }, []);

  const closePopovers = useCallback(() => {
    set({ filterOpen: false, jurSelectorOpen: false });
  }, [set]);

  const toggleKind = useCallback((kind: RecordKind) => {
    setState((s) => {
      const has = s.includedKinds.includes(kind);
      if (has && s.includedKinds.length <= 1) return s; // keep >= 1
      return {
        ...s,
        includedKinds: has
          ? s.includedKinds.filter((k) => k !== kind)
          : [...s.includedKinds, kind],
      };
    });
  }, []);

  const isolateKind = useCallback((kind: RecordKind) => {
    set({ includedKinds: [kind] });
  }, [set]);

  const allKinds = useCallback(() => {
    set({ includedKinds: [...ALL_KINDS] });
  }, [set]);

  const cycleVerified = useCallback(() => {
    // Cycle from the EFFECTIVE level: while a geography exclusive pins the
    // ladder to Residency, the visible cycle is Residency <-> Official.
    setState((s) => ({
      ...s,
      verified: ((effectiveVerifiedFor(s) + 1) % 4) as VerificationTier,
    }));
  }, []);

  const cycleMyDistricts = useCallback(() => {
    setState((s) => {
      const geo = resolveGeoFromState(s);
      // Auto-disabled by the other exclusive: a click restores the remembered
      // mode by retaking priority (which flips the auto-disable over).
      if (geo.autoDisabled === "myDistricts") {
        return { ...s, geoPriority: "myDistricts" };
      }
      // Cycle from the DISPLAYED mode: when the engaged Affected already
      // implies Include, the next step is Only (not a dead click).
      const shown = geo.myDistrictsImplied ? "inclusive" : s.myDistricts;
      const next = nextGeoFilterMode(shown);
      // Entering exclusive takes conflict priority. The Residency Verified
      // floor is derived (pinnedTierMin) — remembered Verified stays untouched.
      return {
        ...s,
        myDistricts: next,
        geoPriority: next === "exclusive" ? "myDistricts" : s.geoPriority,
      };
    });
  }, []);

  const cycleAffected = useCallback(() => {
    setState((s) => {
      const geo = resolveGeoFromState(s);
      if (geo.autoDisabled === "affected") {
        return { ...s, geoPriority: "affected" };
      }
      // Cycle from the DISPLAYED mode: when an engaged My Jurisdiction already
      // implies Include, the next step is Only (not a dead click).
      const shown = geo.affectedImplied ? "inclusive" : s.affected;
      const next = nextGeoFilterMode(shown);
      return {
        ...s,
        affected: next,
        geoPriority: next === "exclusive" ? "affected" : s.geoPriority,
      };
    });
  }, []);

  const cycleMyJurisdiction = useCallback(() => {
    setState((s) => {
      // Cycle from the DISPLAYED mode: when a narrower exclusive already
      // implies Only, the next step is Off. Never auto-disabled (superset
      // population — exclusives always compose), so no priority handling.
      const geo = resolveGeoFromState(s);
      const shown = geo.jurisdictionImplied ? "exclusive" : s.myJurisdiction;
      return { ...s, myJurisdiction: nextGeoFilterMode(shown) };
    });
  }, []);

  const cycleSignedFilter = useCallback(() => {
    setState((s) => ({
      ...s,
      signedFilter: nextSignedFilterLevel(s.signedFilter),
    }));
  }, []);

  const toggleProfileType = useCallback((kind: ActivityKind) => {
    setState((s) => {
      const has = s.profileTypes.includes(kind);
      if (has && s.profileTypes.length <= 1) return s;
      return {
        ...s,
        profileTypes: has
          ? s.profileTypes.filter((k) => k !== kind)
          : [...s.profileTypes, kind],
      };
    });
  }, []);

  const isolateProfileType = useCallback((kind: ActivityKind) => {
    set({ profileTypes: [kind] });
  }, [set]);

  const allProfileTypes = useCallback(() => {
    set({ profileTypes: [...ALL_ACTIVITY] });
  }, [set]);

  // --- Jurisdiction selector ----------------------------------------------
  const toggleJurSelector = useCallback(() => {
    setState((s) => ({
      ...s,
      jurSelectorOpen: !s.jurSelectorOpen,
      filterOpen: false,
    }));
  }, []);

  const toggleSub = useCallback((id: string) => {
    setState((s) => {
      const includedCount = s.subscriptions.filter((x) => x.included).length;
      return {
        ...s,
        subscriptions: s.subscriptions.map((sub) => {
          if (sub.id !== id) return sub;
          if (sub.included && includedCount <= 1) return sub; // keep >= 1
          return { ...sub, included: !sub.included };
        }),
      };
    });
  }, []);

  const selectOnlySub = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      subscriptions: s.subscriptions.map((sub) => ({
        ...sub,
        included: sub.id === id,
      })),
    }));
  }, []);

  const allSubs = useCallback(() => {
    setState((s) => ({
      ...s,
      subscriptions: s.subscriptions.map((sub) => ({ ...sub, included: true })),
    }));
  }, []);

  const openAddJur = useCallback(
    () => set({ addJurOpen: true, jurSelectorOpen: false }),
    [set],
  );
  const closeAddJur = useCallback(() => set({ addJurOpen: false }), [set]);

  const syncMemberships = useCallback((subs: JurisdictionMembership[]) => {
    if (!isMockOnly() && state.loggedIn) {
      void putJurisdictionMemberships(subs).catch((e: Error) => notify(e.message));
    }
  }, [state.loggedIn, notify]);

  const addJurisdiction = useCallback(
    (id: string) => {
      setState((s) => {
        if (s.subscriptions.some((sub) => sub.id === id)) {
          return { ...s, addJurOpen: false };
        }
        const subscriptions = [
          ...s.subscriptions.map((sub) => ({ ...sub, included: false })),
          { id, included: true },
        ];
        syncMemberships(subscriptions);
        return {
          ...s,
          subscriptions,
          addJurOpen: false,
        };
      });
      notify(`Joined ${jurisdictionLabel(id)}.`);
    },
    [notify, syncMemberships],
  );

  const removeJurisdiction = useCallback(
    (id: string) => {
      setState((s) => {
        if (s.subscriptions.length <= 1) {
          return { ...s, addJurOpen: false };
        }
        const next = s.subscriptions.filter((sub) => sub.id !== id);
        let subscriptions = next;
        if (!next.some((sub) => sub.included)) {
          subscriptions = next.map((sub, i) => ({ ...sub, included: i === 0 }));
        }
        syncMemberships(subscriptions);
        return { ...s, subscriptions, addJurOpen: false };
      });
      notify(`Left ${jurisdictionLabel(id)}.`);
    },
    [notify, syncMemberships],
  );

  // --- Auth flow -----------------------------------------------------------
  const closeAuth = useCallback(
    () => set({ ...AUTH_MODALS_CLOSED }),
    [set],
  );
  const goRegister = useCallback(
    () => set({ ...AUTH_MODALS_CLOSED, registerOpen: true }),
    [set],
  );
  const submitRegister = useCallback(
    (data?: RegisterFormData) => {
      if (isMockOnly() || !data) {
        set({
          registerOpen: false,
          otpOpen: true,
          loginOtpWindow: false,
          recoveryOtpWindow: false,
          recoverOpen: false,
        });
        if (isMockOnly()) {
          notify(
            "Mock mode — no OTP was sent. Set NEXT_PUBLIC_MOCK_ONLY=0 in repo-root .env and restart the web-app.",
          );
        }
        return;
      }
      const handleErr = handleValidationError(data.handle);
      if (handleErr) {
        notify(handleErr);
        return;
      }
      const normalized = normalizeHandleBody(data.handle);
      if (!normalized) {
        notify("Invalid handle.");
        return;
      }
      const payload = { ...data, handle: normalized };
      authDraftRef.current = payload;
      saveRegistrationDraft(payload);
      void requestRegistrationOtp(payload.email)
        .then(() => {
          set({
            registerOpen: false,
            otpOpen: true,
            authEmail: payload.email,
            loginOtpWindow: false,
            recoveryOtpWindow: false,
          });
          notify("Code sent — check the API server console in dev.");
        })
        .catch((e: unknown) => {
          const msg =
            e instanceof ApiError
              ? `Registration OTP failed (${e.status}): ${e.message}`
              : e instanceof Error
                ? e.message
                : "Registration OTP failed.";
          notify(msg);
          if (process.env.NODE_ENV === "development") {
            console.error("[auth] requestRegistrationOtp failed:", e);
          }
        });
    },
    [set, notify],
  );

  const submitRecovery = useCallback(
    (data?: { email: string }) => {
      const trimmed = data?.email.trim();
      if (!trimmed) return;
      if (!isValidEmailFormat(trimmed)) {
        notify("Enter a valid email address.");
        return;
      }

      if (isMockOnly()) {
        set({
          recoverOpen: false,
          otpOpen: true,
          authEmail: trimmed,
          recoveryOtpWindow: true,
          loginOtpWindow: false,
          loginOpen: false,
          authOpen: false,
        });
        notify(
          "Mock mode — no OTP was sent. Set NEXT_PUBLIC_MOCK_ONLY=0 in repo-root .env and restart the web-app.",
        );
        return;
      }

      void requestRecoveryOtp(trimmed)
        .then(() => {
          set({
            recoverOpen: false,
            otpOpen: true,
            authEmail: trimmed,
            recoveryOtpWindow: true,
            loginOtpWindow: false,
            loginOpen: false,
            authOpen: false,
          });
          notify("Code sent — check the API server console in dev.");
        })
        .catch((e: unknown) => {
          const msg =
            e instanceof ApiError
              ? e.message
              : e instanceof Error
                ? e.message
                : "Recovery OTP request failed.";
          notify(msg);
        });
    },
    [set, notify],
  );
  // Shared tail for the OTP paths that end signed-in with a passkey (registration
  // and gated login both run the identical enroll → passkey-login → hydrate → apply
  // sequence; only the login-email hint and the success copy differ).
  const finishPasskeyLogin = useCallback(
    async (successMsg: string, email?: string) => {
      await enrollPasskey();
      const login = await loginWithPasskey(email);
      userIdRef.current = login.userId;
      const account = await fetchAccountContext();
      applyAccount(account);
      notify(successMsg);
    },
    [applyAccount, notify],
  );
  const completeOtp = useCallback(
    (code?: string) => {
      if (!code || code.length < 6) return;

      // Login OTP path (gated cross-device login):
      //   OTP verifies a limited `login` session → enroll a passkey → passkey login for full access.
      if (state.loginOtpWindow) {
        if (isMockOnly()) {
          demoLogin();
          return;
        }
        const email = state.authEmail?.trim();
        if (!email) {
          notify("Login email was lost — close this dialog and try again.");
          return;
        }
        void (async () => {
          try {
            await verifyLoginOtp(email, code);
            await finishPasskeyLogin("Signed in with email OTP.", email);
          } catch (e) {
            const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Login failed.";
            notify(msg);
            if (process.env.NODE_ENV === "development") {
              console.error("[auth] verifyLoginOtp failed:", e);
            }
          }
        })();
        return;
      }

      // Recovery OTP path (lost passkey → recovery-scoped session → re-enroll):
      if (state.recoveryOtpWindow) {
        const email = state.authEmail?.trim();
        if (!email) {
          notify("Recovery email was lost — close this dialog and try again.");
          return;
        }

        if (isMockOnly()) {
          set({ ...AUTH_MODALS_CLOSED, loginOpen: true, authEmail: undefined });
          notify("Recovery complete — now log in with your passkey.");
          return;
        }

        void (async () => {
          try {
            await verifyRecoveryOtp(email, code);
            await enrollPasskey();
            set({ ...AUTH_MODALS_CLOSED, loginOpen: true, authEmail: undefined });
            notify("Recovered — now log in with your passkey.");
          } catch (e: unknown) {
            const msg =
              e instanceof ApiError
                ? e.message
                : e instanceof Error
                  ? e.message
                  : "Recovery failed.";
            notify(msg);
          }
        })();
        return;
      }

      // Registration OTP path:
      if (isMockOnly()) {
        demoLogin();
        return;
      }
      const draft = authDraftRef.current ?? loadRegistrationDraft();
      if (!draft?.email?.trim() || !draft.handle?.trim()) {
        notify("Registration data was lost — close this dialog and register again.");
        return;
      }
      const handleErr = handleValidationError(draft.handle);
      if (handleErr) {
        clearRegistrationDraft();
        notify(`${handleErr} Go back and register with a valid handle.`);
        set({ otpOpen: false, registerOpen: true });
        return;
      }
      authDraftRef.current = draft;

      void (async () => {
        try {
          const reg = await verifyRegistrationOtp(
            draft.email.trim(),
            code,
            registrationProfileForApi(draft),
          );
          clearRegistrationDraft();
          userIdRef.current = reg.userId;
          await finishPasskeyLogin("Account created — signed in with passkey.");
        } catch (e) {
          const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Registration failed.";
          notify(msg);
          if (process.env.NODE_ENV === "development") {
            console.error("[auth] verifyRegistrationOtp failed:", e);
          }
        }
      })();
    },
    [
      demoLogin,
      finishPasskeyLogin,
      enrollPasskey,
      notify,
      requestRecoveryOtp,
      state.loginOtpWindow,
      state.recoveryOtpWindow,
      state.authEmail,
      verifyRecoveryOtp,
      set,
    ],
  );
  const goLogin = useCallback(
    () => set({ ...AUTH_MODALS_CLOSED, loginOpen: true }),
    [set],
  );
  const loginPasskey = useCallback(() => {
    if (isMockOnly()) {
      demoLogin();
      return;
    }
    void loginWithPasskey()
      .then(async (res) => {
        userIdRef.current = res.userId;
        applyAccount(await fetchAccountContext());
        notify("Signed in.");
      })
      .catch((e: Error) => notify(e.message));
  }, [demoLogin, applyAccount, notify]);
  const loginVerifyEmail = useCallback(
    (email: string) =>
      set({
        loginOpen: false,
        otpOpen: true,
        authEmail: email.trim(),
        loginOtpWindow: true,
        recoveryOtpWindow: false,
        recoverOpen: false,
      }),
    [set],
  );
  const openLoginOtpWindowByEmail = useCallback(
    (email: string) => {
      const trimmed = email.trim();
      if (isValidEmailFormat(trimmed)) {
        set({ ...AUTH_MODALS_CLOSED, otpOpen: true, loginOtpWindow: true, authEmail: trimmed });
        return;
      }
      set({ ...AUTH_MODALS_CLOSED, loginOpen: true, loginOtpWindow: true, authEmail: trimmed });
    },
    [set],
  );
  const toggleLoginOtpWindow = useCallback(() => {
    setState((s) => ({
      ...s,
      loginOtpWindow: !s.loginOtpWindow,
      recoveryOtpWindow: false,
      recoverOpen: false,
    }));
  }, []);
  const recover = useCallback(
    () => set({ ...AUTH_MODALS_CLOSED, recoverOpen: true }),
    [set],
  );
  const openProfile = useCallback(() => {
    set({ profileOpen: true });
    if (!isMockOnly()) {
      void listPasskeys()
        .then((passkeys) => setState((s) => ({ ...s, passkeys })))
        .catch((e: Error) => notify(e.message));
    }
  }, [set, notify]);
  const closeProfile = useCallback(() => set({ profileOpen: false }), [set]);

  // --- Sign modal ----------------------------------------------------------
  const runCivicWrite = useCallback(
    async <T,>(
      action: SignAction,
      jurisdiction: string,
      sign: CivicSignMode,
      write: (mode: CivicSignMode) => Promise<T>,
      onSuccess: (result: T) => void,
    ) => {
      if (isMockOnly()) {
        onSuccess(undefined as T);
        return;
      }
      const userId = userIdRef.current;
      if (!userId) {
        notify("Sign in to continue.");
        return;
      }
      const mode = resolveCivicSignMode(action, jurisdiction, state.signing, sign);
      try {
        onSuccess(await write(mode));
      } catch (e) {
        notify(e instanceof Error ? e.message : "Write failed.");
      }
    },
    [notify, state.signing],
  );

  const openSign = useCallback(
    (req: SignRequest, commit: SignedCommit) => {
      pendingCommit.current = commit;
      set({ sign: req });
    },
    [set],
  );

  const confirmSign = useCallback(() => {
    const commit = pendingCommit.current;
    pendingCommit.current = null;
    set({ sign: null });
    commit?.("passkey");
  }, [set]);

  const closeSign = useCallback(() => {
    pendingCommit.current = null;
    set({ sign: null });
  }, [set]);

  const openChoose = useCallback(
    (req: ChooseSignRequest, commit: SignedCommit) => {
      pendingCommit.current = commit;
      set({ choose: req });
    },
    [set],
  );

  const confirmChoose = useCallback((sign: CivicSignMode) => {
    const commit = pendingCommit.current;
    pendingCommit.current = null;
    set({ choose: null });
    commit?.(sign);
  }, [set]);

  const closeChoose = useCallback(() => {
    pendingCommit.current = null;
    set({ choose: null });
  }, [set]);

  /**
   * Gate a civic action behind its effective signing method:
   *   ask     → Quick-vs-Passkey chooser (only when passkey isn't mandated)
   *   passkey → Alberta WYSIWYS modal when the jurisdiction mandates it, else
   *             a standing preference that completes immediately
   *   quick   → completes immediately
   * `passkeyReq` is the WYSIWYS payload for the mandated case (null for actions
   * a jurisdiction never makes ledger-final, e.g. comments/reactions).
   */
  const runSigned = useCallback(
    (
      action: SignAction,
      jurisdiction: string,
      choose: ChooseSignRequest,
      passkeyReq: SignRequest | null,
      commit: SignedCommit,
    ) => {
      const jurReq = jurisdictionSignRequirement(jurisdiction, action);
      const method = effectiveSignMethod(state.signing[action], jurReq);
      if (method === "ask") {
        openChoose(choose, commit);
        return;
      }
      if (method === "passkey" && passkeyReq) {
        const isFinal = jurReq === "passkey";
        openSign(
          { ...passkeyReq, isFinal, jurisdiction: jurisdictionLabel(jurisdiction) },
          commit,
        );
        return;
      }
      const sign: CivicSignMode = method === "quick" ? "quick" : "passkey";
      commit(sign);
    },
    [state.signing, openChoose, openSign],
  );

  // --- Civic interactions --------------------------------------------------
  const react = useCallback(
    (target: CivicTarget, dir: "up" | "down") => {
      requireAuth(() => {
        const prev = state.reactions[target.id]?.dir ?? null;
        const existingEntityId = state.reactions[target.id]?.entityId;
        const toggleOff = prev === dir;

        const commitLocal = (reactionEntityId?: string) =>
          setState((s) => {
            const prevDir = s.reactions[target.id]?.dir ?? null;
            const base = s.reactionCounts[target.id] ?? {
              up: target.up ?? 0,
              down: target.down ?? 0,
            };
            let { up, down } = base;
            let nextReaction: "up" | "down" | null;

            if (prevDir === dir) {
              if (dir === "up") up--;
              else down--;
              nextReaction = null;
            } else {
              if (prevDir === "up") up--;
              else if (prevDir === "down") down--;
              if (dir === "up") up++;
              else down++;
              nextReaction = dir;
            }

            return {
              ...s,
              reactions: {
                ...s.reactions,
                [target.id]: nextReaction
                  ? {
                      dir: nextReaction,
                      entityId:
                        reactionEntityId ?? s.reactions[target.id]?.entityId,
                    }
                  : null,
              },
              reactionCounts: {
                ...s.reactionCounts,
                [target.id]: { up, down },
              },
            };
          });

        if (toggleOff && !isMockOnly()) {
          commitLocal();
          return;
        }

        const parentType =
          target.parentType ?? (target.kind ? parentTypeForKind(target.kind) : "post");
        const threadId = target.threadId ?? target.id;

        // Reactions are always quick-signed — no passkey floor, no chooser, no WYSIWYS.
        void runCivicWrite(
          "reaction",
          target.jurisdiction,
          "quick",
          async () => {
            const civic = await import("@/lib/api/civic");
            return civic.civicReaction(
              userIdRef.current!,
              civic.threadRef(threadId, target.jurisdiction),
              target.id,
              parentType,
              reactionKindForDir(dir),
              existingEntityId,
            );
          },
          (entityId) => commitLocal(entityId),
        );
      });
    },
    [requireAuth, runCivicWrite, state.reactions],
  );

  const reactionFor = useCallback(
    (id: string) => state.reactions[id]?.dir ?? null,
    [state.reactions],
  );

  const reactionCountsFor = useCallback(
    (target: CivicTarget) =>
      state.reactionCounts[target.id] ?? {
        up: target.up ?? 0,
        down: target.down ?? 0,
      },
    [state.reactionCounts],
  );

  const setVote = useCallback(
    (target: CivicTarget, option: string | null) => {
      setState((s) => {
        const votes = { ...s.votes };
        if (option) votes[target.id] = option;
        else delete votes[target.id];
        return { ...s, votes };
      });
      if (option) notify("Vote recorded.");
    },
    [notify],
  );

  const votePoll = useCallback(
    (target: CivicTarget, option: string) => {
      requireAuth(() => {
        const current = state.votes[target.id] ?? null;
        // Alberta mandates passkey for votes → ledger-final: no changing once cast.
        const isFinal =
          jurisdictionSignRequirement(target.jurisdiction, "vote") === "passkey";
        if (isFinal && current) return;
        const next = current === option ? null : option;
        // Clearing a vote isn't a signed civic act — just drop it.
        if (next === null) {
          setVote(target, null);
          return;
        }
        runSigned(
          "vote",
          target.jurisdiction,
          {
            title: "Cast your vote",
            lines: [`“${option}” on`, `“${target.title}”`],
          },
          {
            kind: "poll",
            targetTitle: target.title,
            option,
            showResidencyNotice: state.kycTier < 2,
            showAffectedNotice:
              state.kycTier >= 2 &&
              outsideMyDistricts(target, state.viewerDistricts),
          },
          (sign) => {
            void runCivicWrite(
              "vote",
              target.jurisdiction,
              sign,
              async (mode) => {
                const civic = await import("@/lib/api/civic");
                await civic.civicVote(
                  userIdRef.current!,
                  civic.threadRef(target.id, target.jurisdiction),
                  target.id,
                  option,
                  mode,
                );
              },
              () => setVote(target, option),
            );
          },
        );
      });
    },
    [
      requireAuth,
      runSigned,
      runCivicWrite,
      setVote,
      state.votes,
      state.kycTier,
      state.viewerDistricts,
    ],
  );

  const voteFor = useCallback(
    (id: string) => state.votes[id] ?? null,
    [state.votes],
  );

  const petitionSigFor = useCallback(
    (target: CivicTarget) => state.petitionSig[target.id] ?? target.sig ?? 0,
    [state.petitionSig],
  );

  const hasSignedPetition = useCallback(
    (id: string) => id in state.petitionSig,
    [state.petitionSig],
  );

  const commitSign = useCallback(
    (target: CivicTarget) => {
      setState((s) => ({
        ...s,
        petitionSig: {
          ...s.petitionSig,
          [target.id]: (s.petitionSig[target.id] ?? target.sig ?? 0) + 1,
        },
      }));
      notify("Signature recorded.");
    },
    [notify],
  );

  const signPetition = useCallback(
    (target: CivicTarget) => {
      requireAuth(() => {
        runSigned(
          "signature",
          target.jurisdiction,
          { title: "Sign the petition", lines: [`“${target.title}”`] },
          {
            kind: "petition",
            targetTitle: target.title,
            showResidencyNotice: state.kycTier < 2,
            showAffectedNotice:
              state.kycTier >= 2 &&
              outsideMyDistricts(target, state.viewerDistricts),
          },
          (sign) => {
            void runCivicWrite(
              "signature",
              target.jurisdiction,
              sign,
              async (mode) => {
                const civic = await import("@/lib/api/civic");
                await civic.civicSignPetition(
                  userIdRef.current!,
                  civic.threadRef(target.id, target.jurisdiction),
                  target.id,
                  mode,
                );
              },
              () => commitSign(target),
            );
          },
        );
      });
    },
    [requireAuth, runSigned, runCivicWrite, commitSign, state.kycTier, state.viewerDistricts],
  );

  // --- Compose flow --------------------------------------------------------
  // The FAB is available on every view now, so a single top-bar jurisdiction
  // (a scoped feed, or an open jurisdiction/district/post) is inferred and the
  // "where" step is skipped straight to type selection. Only infer a
  // jurisdiction the viewer actually subscribes to (posting requires it).
  const startCompose = useCallback(
    (inferredJurisdiction?: string) => {
      requireAuth(() => {
        setState((s) => {
          const canInfer =
            inferredJurisdiction !== undefined &&
            s.subscriptions.some((sub) => sub.id === inferredJurisdiction);
          const many = s.subscriptions.length > 1;
          return {
            ...s,
            composeOpen: true,
            composeStep: canInfer || !many ? "type" : "where",
            composeJur: canInfer
              ? inferredJurisdiction
              : many
                ? undefined
                : s.subscriptions[0]?.id,
            composeType: undefined,
            filterOpen: false,
            jurSelectorOpen: false,
          };
        });
      });
    },
    [requireAuth],
  );

  const selectComposeJurisdiction = useCallback((name: string) => {
    setState((s) => ({
      ...s,
      composeJur: name,
      composeDistricts: [],
      composeStep: s.composeStep === "compose" ? "compose" : "type",
    }));
  }, []);
  const selectComposeType = useCallback(
    (kind: RecordKind) => set({ composeType: kind, composeStep: "compose" }),
    [set],
  );
  const changeComposeType = useCallback(
    () => set({ composeStep: "type", composeType: undefined }),
    [set],
  );
  // Return to the jurisdiction picker to correct an inferred/specified scope.
  const changeComposeJurisdiction = useCallback(
    () => set({ composeStep: "where", composeJur: undefined, composeType: undefined, composeDistricts: [] }),
    [set],
  );
  const setComposeVisibility = useCallback((v: AuthorVisibility) => {
    setState((s) => ({ ...s, composeVisibility: v }));
  }, []);
  const setComposeTitle = useCallback((v: string) => {
    setState((s) => ({ ...s, composeTitle: v }));
  }, []);
  const setComposeBody = useCallback((v: string) => {
    setState((s) => ({ ...s, composeBody: v }));
  }, []);
  const setComposePollOptions = useCallback((v: string[]) => {
    setState((s) => ({ ...s, composePollOptions: v }));
  }, []);
  const setComposeDistricts = useCallback((slugs: string[]) => {
    setState((s) => ({ ...s, composeDistricts: slugs }));
  }, []);

  const closeCompose = useCallback(
    () =>
      set({
        composeOpen: false,
        composeStep: "where",
        composeJur: undefined,
        composeType: undefined,
        composeVisibility: undefined,
        composeTitle: "",
        composeBody: "",
        composePollOptions: ["", ""],
        composeDistricts: [],
      }),
    [set],
  );

  const submitCompose = useCallback(() => {
    const jur = state.composeJur ?? GLOBAL_ID;
    const kind = state.composeType ?? "statement";
    const label = state.composeType
      ? RECORD_TYPE_LABEL[state.composeType]
      : "post";
    const effectiveVis = resolveVisibility(
      state.accountVisibility,
      state.composeVisibility,
    );
    const title = state.composeTitle.trim() || `New ${label}`;
    const body = state.composeBody.trim() || "(no details)";
    const selfHandle =
      wireHandle(state.accountHandle) ?? (isMockOnly() ? MY_HANDLE : "you");
    const threadId = crypto.randomUUID();
    const finish = (personaName?: string | null) => {
      closeCompose();
      notify(
        effectiveVis === "public"
          ? isMockOnly()
            ? `${label} published (demo).`
            : `${label} published.`
          : isMockOnly()
            ? `${label} published (demo) — out-of-scope viewers see you as ${personaNameFor(
                selfHandle,
                threadId,
              )}.`
            : `${label} published — out-of-scope viewers see you as ${
                personaName ?? personaNameFor(selfHandle, threadId)
              }.`,
      );
    };
    const composeAction = postActionForKind(kind);
    runSigned(
      composeAction,
      jur,
      { title: `Publish your ${label}`, lines: [`in ${jurisdictionLabel(jur)}`] },
      {
        kind: "compose" as SignKind,
        targetTitle: label,
        composeTypeLabel: label,
        showResidencyNotice: state.kycTier < 2,
        showAffectedNotice: false,
      },
      (sign) => {
        void runCivicWrite(
          composeAction,
          jur,
          sign,
          async (mode) => {
            const civic = await import("@/lib/api/civic");
            const result = await civic.civicCompose(
              userIdRef.current!,
              civic.threadRef(threadId, jur),
              kind,
              {
                title,
                body,
                pollOptions: state.composePollOptions,
                districtSlugs:
                  state.composeDistricts.length > 0
                    ? state.composeDistricts
                    : undefined,
              },
              mode,
            );
            if (!isMockOnly() && state.composeVisibility !== undefined) {
              await putThreadVisibility(threadId, effectiveVis);
            }
            return result.personaName;
          },
          finish,
        );
      },
    );
  }, [
    state.composeJur,
    state.composeType,
    state.composeTitle,
    state.composeBody,
    state.composePollOptions,
    state.composeDistricts,
    state.kycTier,
    state.accountVisibility,
    state.composeVisibility,
    runSigned,
    runCivicWrite,
    closeCompose,
    notify,
  ]);

  // --- Reply ---------------------------------------------------------------
  const startReply = useCallback(() => {
    requireAuth(() => set({ replyOpen: true }));
  }, [requireAuth, set]);
  const closeReply = useCallback(() => set({ replyOpen: false }), [set]);

  // --- Share ---------------------------------------------------------------
  // Sharing is a read affordance (no auth gate) — anyone can copy/forward a
  // public record or comment.
  const openShare = useCallback(
    (target: ShareTarget) => set({ share: target }),
    [set],
  );
  const closeShare = useCallback(() => set({ share: null }), [set]);

  const shareCountFor = useCallback(
    (key: string) => {
      if (key in state.shareCounts) return state.shareCounts[key];
      return shareBaseCount(key) + (state.shared[key] ? 1 : 0);
    },
    [state.shared, state.shareCounts],
  );
  const hasShared = useCallback(
    (key: string) => Boolean(state.shared[key]),
    [state.shared],
  );
  // Sharing is counted once per account — a second action on the same target
  // (or a different channel) never re-increments the tally.
  const recordShare = useCallback((key: string) => {
    if (isMockOnly()) {
      setState((s) =>
        s.shared[key] ? s : { ...s, shared: { ...s.shared, [key]: true } },
      );
      return;
    }
    void postShareMark(key)
      .then(({ count }) => {
        setState((s) =>
          s.shared[key]
            ? s
            : {
                ...s,
                shared: { ...s.shared, [key]: true },
                shareCounts: { ...s.shareCounts, [key]: count },
              },
        );
      })
      .catch((e: Error) => notify(e.message));
  }, [notify]);

  const hydrateRecordState = useCallback(
    (ids: string[]) => {
      if (!state.loggedIn || isMockOnly() || ids.length === 0) return;
      void getRecordStates(ids)
        .then((states) => {
          setState((s) => {
            const applied = applyRecordStates(states, {
              reactions: s.reactions,
              votes: s.votes,
              shared: s.shared,
              petitionSig: s.petitionSig,
            });
            return { ...s, ...applied };
          });
        })
        .catch(() => {
          // Logged-out or session expired — ignore.
        });
    },
    [state.loggedIn],
  );

  const setThreadVisibility = useCallback(
    (threadId: string, visibility: AuthorVisibility) => {
      writeThreadVisibility(threadId, visibility);
      if (!isMockOnly()) {
        void putThreadVisibility(threadId, visibility).catch((e: Error) =>
          notify(e.message),
        );
      }
    },
    [notify],
  );

  const openChangeAddress = useCallback(() => {
    requireAuth(() => set({ addressOpen: true, profileOpen: false }));
  }, [requireAuth, set]);

  const closeChangeAddress = useCallback(() => set({ addressOpen: false }), [set]);

  const submitAddress = useCallback(
    (data: AddressFormData) => {
      if (isMockOnly()) {
        closeChangeAddress();
        notify("Address saved (demo).");
        return;
      }
      void patchProfile({
        line1: data.line1,
        city: data.city,
        province: data.province,
        postalCode: data.postalCode,
        country: data.country,
      })
        .then(() => attestResidency())
        .then(() => fetchAccountContext())
        .then((account) => {
          if (account) applyAccount(account);
          closeChangeAddress();
          notify("Address saved — residency verification updated.");
        })
        .catch((e: Error) => notify(e.message));
    },
    [applyAccount, closeChangeAddress, notify],
  );

  // Comments/reactions are never ledger-final, so a jurisdiction never forces
  // passkey here — the account default decides. `done` runs the actual write
  // (composer close + toast) after the signing method resolves.
  const postComment = useCallback(
    (ctx: CommentWriteContext, done: (personaName?: string) => void) => {
      requireAuth(() => {
        const body = ctx.body.trim();
        if (!body) {
          notify("Write something before posting.");
          return;
        }
        runSigned(
          "comment",
          ctx.jurisdiction,
          { title: "Post your comment", lines: [`on “${ctx.targetTitle}”`] },
          {
            kind: "comment",
            targetTitle: ctx.targetTitle,
            showResidencyNotice: false,
            showAffectedNotice: false,
          },
          (sign) => {
            void runCivicWrite(
              "comment",
              ctx.jurisdiction,
              sign,
              async (mode) => {
                const civic = await import("@/lib/api/civic");
                return civic.civicComment(
                  userIdRef.current!,
                  civic.threadRef(ctx.threadId, ctx.jurisdiction),
                  ctx.parentId,
                  ctx.parentType,
                  body,
                  mode,
                );
              },
              (personaName) => done(personaName ?? undefined),
            );
          },
        );
      });
    },
    [requireAuth, runSigned, runCivicWrite, notify],
  );

  // --- View coordination ---------------------------------------------------
  const setPageJurisdiction = useCallback((name: string | null) => {
    setState((s) => (s.pageJurisdiction === name ? s : { ...s, pageJurisdiction: name }));
  }, []);
  const setPostDistricts = useCallback((districts: string[] | null) => {
    setState((s) => {
      const same =
        s.postDistricts === districts ||
        (s.postDistricts != null &&
          districts != null &&
          s.postDistricts.join("|") === districts.join("|"));
      return same ? s : { ...s, postDistricts: districts };
    });
  }, []);

  const viewer = useMemo(
    () => viewerFromState(state),
    [state.loggedIn, state.kycTier, state.viewerDistricts, state.accountVisibility],
  );
  const feedFilter = useMemo(
    () => feedFilterFromState(state),
    [
      state.subscriptions,
      state.includedKinds,
      state.verified,
      state.myDistricts,
      state.affected,
      state.myJurisdiction,
      state.geoPriority,
      state.signedFilter,
    ],
  );

  const api: AppApi = {
    state,
    viewer,
    feedFilter,
    effectiveVerified: effectiveVerifiedFor(state),
    demoLogin,
    logout,
    cycleKyc,
    requireAuth,
    toggleFilter,
    closePopovers,
    toggleKind,
    isolateKind,
    allKinds,
    cycleVerified,
    cycleMyDistricts,
    cycleAffected,
    cycleMyJurisdiction,
    cycleSignedFilter,
    toggleProfileType,
    isolateProfileType,
    allProfileTypes,
    toggleJurSelector,
    toggleSub,
    selectOnlySub,
    allSubs,
    openAddJur,
    closeAddJur,
    addJurisdiction,
    removeJurisdiction,
    openAuth,
    closeAuth,
    goRegister,
    submitRegister,
    completeOtp,
    goLogin,
    loginPasskey,
    loginVerifyEmail,
    openLoginOtpWindowByEmail,
    toggleLoginOtpWindow,
    recover,
    submitRecovery,
    openProfile,
    closeProfile,
    addDevice,
    addDeviceByEmail,
    renamePasskey,
    revokePasskey,
    toggleTheme,
    setSigning,
    setPostSigning,
    setAccountVisibility,
    react,
    reactionFor,
    reactionCountsFor,
    votePoll,
    voteFor,
    signPetition,
    petitionSigFor,
    hasSignedPetition,
    postComment,
    startCompose,
    selectComposeJurisdiction,
    selectComposeType,
    changeComposeType,
    changeComposeJurisdiction,
    setComposeVisibility,
    setComposeTitle,
    setComposeBody,
    setComposePollOptions,
    setComposeDistricts,
    submitCompose,
    closeCompose,
    confirmSign,
    closeSign,
    confirmChoose,
    closeChoose,
    startReply,
    closeReply,
    openShare,
    closeShare,
    shareCountFor,
    hasShared,
    recordShare,
    hydrateRecordState,
    setThreadVisibility,
    openChangeAddress,
    closeChangeAddress,
    submitAddress,
    setPageJurisdiction,
    setPostDistricts,
    notify,
    dismissToast,
  };

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}

/** Access the app state + actions. Must be used under <AppProvider>. */
export function useApp(): AppApi {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within an AppProvider");
  return ctx;
}
