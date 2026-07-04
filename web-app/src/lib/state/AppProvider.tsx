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
  RecordKind,
  SignAction,
  SignMethod,
  VerificationTier,
  ViewerContext,
} from "@/lib/types";
import {
  DEFAULT_SIGNING,
  POST_SUB_ACTIONS,
  effectiveSignMethod,
  jurisdictionSignRequirement,
  postActionForKind,
} from "@/lib/types";
import { MY_DISTRICTS, MY_HANDLE, MY_NAME } from "@/lib/mock";
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
  jurisdiction: string;
  title: string;
  sig?: number;
  up?: number;
  down?: number;
  districts: string[];
}

/** Pre-hydration defaults (exported for state-derivation tests). */
export const INITIAL_APP_STATE: AppState = {
  loggedIn: false,
  kycTier: 0,
  viewerDistricts: [],
  accountVisibility: "anonymous",
  devices: ["iPhone 15 — this device", "MacBook Pro", "Pixel 8"],
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
  profileOpen: false,
  addJurOpen: false,

  composeOpen: false,
  composeStep: "where",
  composeJur: undefined,
  composeType: undefined,
  composeVisibility: undefined,

  sign: null,
  choose: null,
  share: null,

  reactions: {},
  reactionCounts: {},
  votes: {},
  petitionSig: {},
  shared: {},

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
  submitRegister: () => void;
  completeOtp: () => void;
  goLogin: () => void;
  loginPasskey: () => void;
  loginVerifyEmail: () => void;
  toggleLoginOtpWindow: () => void;
  recover: () => void;
  openProfile: () => void;
  closeProfile: () => void;

  // Profile modal account management.
  addDevice: () => void;
  addDeviceByEmail: () => void;
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
  postComment: (jurisdiction: string, targetTitle: string, done: () => void) => void;

  // Compose flow.
  startCompose: (inferredJurisdiction?: string) => void;
  selectComposeJurisdiction: (name: string) => void;
  selectComposeType: (kind: RecordKind) => void;
  changeComposeType: () => void;
  changeComposeJurisdiction: () => void;
  /** Per-post visibility override (defaults to the account level; may widen or narrow). */
  setComposeVisibility: (v: AuthorVisibility) => void;
  submitCompose: () => void;
  closeCompose: () => void;

  // Alberta sign confirmation.
  confirmSign: () => void;
  closeSign: () => void;

  // "Ask" Quick-vs-Passkey chooser.
  confirmChoose: () => void;
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

  // Shared-chrome coordination (set by the active view).
  setPageJurisdiction: (name: string | null) => void;
  setPostDistricts: (districts: string[] | null) => void;

  // "Not built" affordances (edit history, account settings, recovery, …).
  notify: (message: string) => void;
  dismissToast: () => void;
}

const AppContext = createContext<AppApi | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(INITIAL_APP_STATE);
  const pendingCommit = useRef<(() => void) | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Skip the mount-time session write so it can't clobber the cookie before
  // the persisted values are hydrated in.
  const sessionHydrated = useRef(false);

  const set = useCallback((patch: Partial<AppState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  // Load persisted subscriptions + session (login/KYC) on mount; persist on
  // every change. viewerDistricts is derived from the restored KYC tier.
  useEffect(() => {
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
  useEffect(() => {
    if (!signingHydrated.current) {
      signingHydrated.current = true;
      return;
    }
    writeSigning(state.signing);
  }, [state.signing]);
  useEffect(() => {
    writeSubscriptions(state.subscriptions);
  }, [state.subscriptions]);
  useEffect(() => {
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

  const closeAllModals = useCallback(() => {
    set({
      authOpen: false,
      registerOpen: false,
      otpOpen: false,
      loginOpen: false,
      profileOpen: false,
      addJurOpen: false,
    });
  }, [set]);

  // --- Session -------------------------------------------------------------
  const demoLogin = useCallback(() => {
    setState((s) => {
      const hasAlberta = s.subscriptions.some((sub) => sub.name === "Alberta");
      // Accounts start with no registry status (Unverified); the remembered
      // KYC tier is kept if one was already reached this session.
      return {
        ...s,
        loggedIn: true,
        viewerDistricts: s.kycTier >= 2 ? MY_DISTRICTS : [],
        authOpen: false,
        registerOpen: false,
        otpOpen: false,
        loginOpen: false,
        subscriptions: hasAlberta
          ? s.subscriptions
          : [...s.subscriptions, { name: "Alberta", included: true }],
      };
    });
    notify("Signed in (demo). Validate your ID to build up verification.");
  }, [notify]);

  const logout = useCallback(() => {
    setState((s) => ({
      ...s,
      loggedIn: false,
      kycTier: 0,
      viewerDistricts: [],
      profileOpen: false,
    }));
    notify("Signed out.");
  }, [notify]);

  // Wireframe addDeviceBtn: registers a passkey on this device (count grows).
  const addDevice = useCallback(() => {
    setState((s) => ({
      ...s,
      devices: [...s.devices, `New device (passkey ${s.devices.length + 1})`],
    }));
    notify("Passkey added to this device (demo).");
  }, [notify]);

  // Wireframe addDeviceEmailBtn: opens the account's OTP-login window so a
  // new device can sign in by email and register its own passkey.
  const addDeviceByEmail = useCallback(() => {
    set({ loginOtpWindow: true });
    notify("OTP window opened — log in by email on the new device.");
  }, [set, notify]);

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
  }, []);

  const cycleKyc = useCallback(() => {
    // Cycle the full ladder incl. Official (tier 3) so the demo can exercise
    // official-authored data: Unverified → Identity → Residency → Official.
    setState((s) => {
      const next = ((s.kycTier + 1) % 4) as VerificationTier;
      return {
        ...s,
        kycTier: next,
        viewerDistricts: next >= 2 ? MY_DISTRICTS : [],
      };
    });
  }, []);

  const openAuth = useCallback(() => {
    set({
      authOpen: true,
      registerOpen: false,
      otpOpen: false,
      loginOpen: false,
    });
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

  const toggleSub = useCallback((name: string) => {
    setState((s) => {
      const includedCount = s.subscriptions.filter((x) => x.included).length;
      return {
        ...s,
        subscriptions: s.subscriptions.map((sub) => {
          if (sub.name !== name) return sub;
          if (sub.included && includedCount <= 1) return sub; // keep >= 1
          return { ...sub, included: !sub.included };
        }),
      };
    });
  }, []);

  const selectOnlySub = useCallback((name: string) => {
    setState((s) => ({
      ...s,
      subscriptions: s.subscriptions.map((sub) => ({
        ...sub,
        included: sub.name === name,
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

  const addJurisdiction = useCallback(
    (name: string) => {
      setState((s) => {
        if (s.subscriptions.some((sub) => sub.name === name)) {
          return { ...s, addJurOpen: false };
        }
        return {
          ...s,
          subscriptions: [
            ...s.subscriptions.map((sub) => ({ ...sub, included: false })),
            { name, included: true },
          ],
          addJurOpen: false,
        };
      });
      notify(`Joined ${name}.`);
    },
    [notify],
  );

  const removeJurisdiction = useCallback(
    (name: string) => {
      setState((s) => {
        if (s.subscriptions.length <= 1) {
          return { ...s, addJurOpen: false };
        }
        const next = s.subscriptions.filter((sub) => sub.name !== name);
        if (!next.some((sub) => sub.included)) {
          return {
            ...s,
            subscriptions: next.map((sub, i) => ({ ...sub, included: i === 0 })),
            addJurOpen: false,
          };
        }
        return { ...s, subscriptions: next, addJurOpen: false };
      });
      notify(`Left ${name}.`);
    },
    [notify],
  );

  // --- Auth flow -----------------------------------------------------------
  const closeAuth = useCallback(
    () =>
      set({
        authOpen: false,
        registerOpen: false,
        otpOpen: false,
        loginOpen: false,
      }),
    [set],
  );
  const goRegister = useCallback(
    () => set({ authOpen: false, registerOpen: true }),
    [set],
  );
  const submitRegister = useCallback(
    () => set({ registerOpen: false, otpOpen: true }),
    [set],
  );
  const completeOtp = useCallback(() => demoLogin(), [demoLogin]);
  const goLogin = useCallback(
    () => set({ authOpen: false, loginOpen: true }),
    [set],
  );
  const loginPasskey = useCallback(() => demoLogin(), [demoLogin]);
  const loginVerifyEmail = useCallback(
    () => set({ loginOpen: false, otpOpen: true }),
    [set],
  );
  const toggleLoginOtpWindow = useCallback(() => {
    setState((s) => ({ ...s, loginOtpWindow: !s.loginOtpWindow }));
  }, []);
  const recover = useCallback(
    () => notify("Account recovery is not built in this demo."),
    [notify],
  );
  const openProfile = useCallback(() => set({ profileOpen: true }), [set]);
  const closeProfile = useCallback(() => set({ profileOpen: false }), [set]);

  // --- Sign modal ----------------------------------------------------------
  const openSign = useCallback(
    (req: SignRequest, commit: () => void) => {
      pendingCommit.current = commit;
      set({ sign: req });
    },
    [set],
  );

  const confirmSign = useCallback(() => {
    const commit = pendingCommit.current;
    pendingCommit.current = null;
    set({ sign: null });
    commit?.();
  }, [set]);

  const closeSign = useCallback(() => {
    pendingCommit.current = null;
    set({ sign: null });
  }, [set]);

  const openChoose = useCallback(
    (req: ChooseSignRequest, commit: () => void) => {
      pendingCommit.current = commit;
      set({ choose: req });
    },
    [set],
  );

  // Both chooser buttons (Quick Sign / Sign with Passkey) complete the action;
  // the cryptographic tier differs, but the demo write is the same.
  const confirmChoose = useCallback(() => {
    const commit = pendingCommit.current;
    pendingCommit.current = null;
    set({ choose: null });
    commit?.();
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
      commit: () => void,
    ) => {
      const jurReq = jurisdictionSignRequirement(jurisdiction, action);
      const method = effectiveSignMethod(state.signing[action], jurReq);
      if (method === "ask") {
        openChoose(choose, commit);
        return;
      }
      if (method === "passkey" && passkeyReq) {
        // "Final" is derived: the jurisdiction is what demanded passkey (Alberta
        // ledger act), so it carries the FINAL/residency/affected notices. A
        // standing passkey preference shows the same confirmation without them.
        const isFinal = jurReq === "passkey";
        openSign({ ...passkeyReq, isFinal, jurisdiction }, commit);
        return;
      }
      commit();
    },
    [state.signing, openChoose, openSign],
  );

  // --- Civic interactions --------------------------------------------------
  const react = useCallback(
    (target: CivicTarget, dir: "up" | "down") => {
      requireAuth(() => {
        const commit = () =>
          setState((s) => {
            const prev = s.reactions[target.id]?.dir ?? null;
            const base = s.reactionCounts[target.id] ?? {
              up: target.up ?? 0,
              down: target.down ?? 0,
            };
            let { up, down } = base;
            let nextReaction: "up" | "down" | null;

            if (prev === dir) {
              if (dir === "up") up--;
              else down--;
              nextReaction = null;
            } else {
              if (prev === "up") up--;
              else if (prev === "down") down--;
              if (dir === "up") up++;
              else down++;
              nextReaction = dir;
            }

            return {
              ...s,
              reactions: {
                ...s.reactions,
                [target.id]: nextReaction ? { dir: nextReaction } : null,
              },
              reactionCounts: {
                ...s.reactionCounts,
                [target.id]: { up, down },
              },
            };
          });
        runSigned(
          "reaction",
          target.jurisdiction,
          { title: "Post your reaction", lines: [`on “${target.title}”`] },
          {
            kind: "reaction",
            targetTitle: target.title,
            showResidencyNotice: false,
            showAffectedNotice: false,
          },
          commit,
        );
      });
    },
    [requireAuth, runSigned],
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
          () => setVote(target, option),
        );
      });
    },
    [
      requireAuth,
      runSigned,
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
          () => commitSign(target),
        );
      });
    },
    [requireAuth, runSigned, commitSign, state.kycTier, state.viewerDistricts],
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
            s.subscriptions.some((sub) => sub.name === inferredJurisdiction);
          const many = s.subscriptions.length > 1;
          return {
            ...s,
            composeOpen: true,
            composeStep: canInfer || !many ? "type" : "where",
            composeJur: canInfer
              ? inferredJurisdiction
              : many
                ? undefined
                : s.subscriptions[0]?.name,
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
    () => set({ composeStep: "where", composeJur: undefined, composeType: undefined }),
    [set],
  );
  const setComposeVisibility = useCallback((v: AuthorVisibility) => {
    setState((s) => ({ ...s, composeVisibility: v }));
  }, []);

  const closeCompose = useCallback(
    () =>
      set({
        composeOpen: false,
        composeStep: "where",
        composeJur: undefined,
        composeType: undefined,
        composeVisibility: undefined,
      }),
    [set],
  );

  const submitCompose = useCallback(() => {
    const jur = state.composeJur ?? "Global";
    const kind = state.composeType ?? "statement";
    const label = state.composeType
      ? RECORD_TYPE_LABEL[state.composeType]
      : "post";
    // Nothing persists (writes are stubbed), but the toast tells the anonymity
    // story: when the effective visibility isn't public, name the per-thread
    // persona out-of-scope viewers would see on the new thread.
    const effectiveVis = resolveVisibility(
      state.accountVisibility,
      state.composeVisibility,
    );
    const finish = () => {
      closeCompose();
      notify(
        effectiveVis === "public"
          ? `${label} published (demo).`
          : `${label} published (demo) — out-of-scope viewers see you as ${personaNameFor(
              MY_HANDLE,
              `compose-${Date.now()}`,
            )}.`,
      );
    };
    runSigned(
      postActionForKind(kind),
      jur,
      { title: `Publish your ${label}`, lines: [`in ${jur}`] },
      {
        kind: "compose" as SignKind,
        targetTitle: label,
        composeTypeLabel: label,
        showResidencyNotice: state.kycTier < 2,
        showAffectedNotice: false,
      },
      finish,
    );
  }, [
    state.composeJur,
    state.composeType,
    state.kycTier,
    state.accountVisibility,
    state.composeVisibility,
    runSigned,
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
    (key: string) => shareBaseCount(key) + (state.shared[key] ? 1 : 0),
    [state.shared],
  );
  const hasShared = useCallback(
    (key: string) => Boolean(state.shared[key]),
    [state.shared],
  );
  // Sharing is counted once per account — a second action on the same target
  // (or a different channel) never re-increments the tally.
  const recordShare = useCallback((key: string) => {
    setState((s) =>
      s.shared[key] ? s : { ...s, shared: { ...s.shared, [key]: true } },
    );
  }, []);

  // Comments/reactions are never ledger-final, so a jurisdiction never forces
  // passkey here — the account default decides. `done` runs the actual write
  // (composer close + toast) after the signing method resolves.
  const postComment = useCallback(
    (jurisdiction: string, targetTitle: string, done: () => void) => {
      requireAuth(() => {
        runSigned(
          "comment",
          jurisdiction,
          { title: "Post your comment", lines: [`on “${targetTitle}”`] },
          {
            kind: "comment",
            targetTitle,
            showResidencyNotice: false,
            showAffectedNotice: false,
          },
          done,
        );
      });
    },
    [requireAuth, runSigned],
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
    toggleLoginOtpWindow,
    recover,
    openProfile,
    closeProfile,
    addDevice,
    addDeviceByEmail,
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
