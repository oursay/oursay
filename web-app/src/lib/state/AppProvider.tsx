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
  FeedFilterParams,
  RecordKind,
  VerificationTier,
  ViewerContext,
} from "@/lib/types";
import { MY_DISTRICTS, MY_NAME } from "@/lib/mock";
import {
  outsideMyDistricts,
  pinnedTierMin,
  resolveGeography,
} from "@/lib/read-model";
import type { ResolvedGeography } from "@/lib/read-model";
import { RECORD_TYPE_LABEL } from "@/components/content";
import type { SignKind } from "@/components";
import { nextSignedFilterLevel } from "@/lib/types/sign-tier";
import { nextGeoFilterMode } from "@/lib/types";
import type { AppState, SignRequest } from "./types";
import { feedFilterFromState, viewerFromState } from "./filters";
import {
  DEFAULT_SUBSCRIPTIONS,
  readSubscriptions,
  writeSubscriptions,
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

const INITIAL: AppState = {
  loggedIn: false,
  kycTier: 0,
  viewerDistricts: [],
  devices: ["iPhone 15 — this device", "MacBook Pro", "Pixel 8"],
  theme: "light",

  includedKinds: [...ALL_KINDS],
  verified: 0,
  myDistricts: "off",
  affected: "off",
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

  sign: null,

  reactions: {},
  reactionCounts: {},
  votes: {},
  petitionSig: {},

  replyOpen: false,

  pageJurisdiction: null,
  postDistricts: null,

  toast: null,
};

/** Alberta gates civic writes behind the WYSIWYS passkey modal; Global acts now. */
function isFinalJurisdiction(jurisdiction: string): boolean {
  return jurisdiction === "Alberta";
}

/** Geography resolution against the state's post context (see resolveGeography). */
function resolveGeoFromState(s: AppState): ResolvedGeography {
  return resolveGeography(
    feedFilterFromState(s),
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

  // Civic interactions (stubbed writes).
  react: (target: CivicTarget, dir: "up" | "down") => void;
  reactionFor: (id: string) => "up" | "down" | null;
  reactionCountsFor: (target: CivicTarget) => { up: number; down: number };
  votePoll: (target: CivicTarget, option: string) => void;
  voteFor: (id: string) => string | null;
  signPetition: (target: CivicTarget) => void;
  petitionSigFor: (target: CivicTarget) => number;
  hasSignedPetition: (id: string) => boolean;

  // Compose flow.
  startCompose: () => void;
  selectComposeJurisdiction: (name: string) => void;
  selectComposeType: (kind: RecordKind) => void;
  changeComposeType: () => void;
  submitCompose: () => void;
  closeCompose: () => void;

  // Alberta sign confirmation.
  confirmSign: () => void;
  closeSign: () => void;

  // Post reply composer.
  startReply: () => void;
  closeReply: () => void;

  // Shared-chrome coordination (set by the active view).
  setPageJurisdiction: (name: string | null) => void;
  setPostDistricts: (districts: string[] | null) => void;

  // "Not built" affordances (edit history, account settings, recovery, …).
  notify: (message: string) => void;
  dismissToast: () => void;
}

const AppContext = createContext<AppApi | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(INITIAL);
  const pendingCommit = useRef<(() => void) | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = useCallback((patch: Partial<AppState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  // Load persisted subscriptions on mount; persist on every change.
  useEffect(() => {
    setState((s) => ({ ...s, subscriptions: readSubscriptions() }));
  }, []);
  useEffect(() => {
    writeSubscriptions(state.subscriptions);
  }, [state.subscriptions]);

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
      return {
        ...s,
        loggedIn: true,
        kycTier: 2,
        viewerDistricts: MY_DISTRICTS,
        authOpen: false,
        registerOpen: false,
        otpOpen: false,
        loginOpen: false,
        subscriptions: hasAlberta
          ? s.subscriptions
          : [...s.subscriptions, { name: "Alberta", included: true }],
      };
    });
    notify("Signed in as a residency-verified demo account.");
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

  const cycleKyc = useCallback(() => {
    setState((s) => {
      const next = ((s.kycTier + 1) % 3) as VerificationTier;
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
      if (resolveGeoFromState(s).autoDisabled === "affected") {
        return { ...s, geoPriority: "affected" };
      }
      const next = nextGeoFilterMode(s.affected);
      return {
        ...s,
        affected: next,
        geoPriority: next === "exclusive" ? "affected" : s.geoPriority,
      };
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

  // --- Civic interactions --------------------------------------------------
  const react = useCallback(
    (target: CivicTarget, dir: "up" | "down") => {
      requireAuth(() => {
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
      });
    },
    [requireAuth],
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
        if (isFinalJurisdiction(target.jurisdiction)) {
          if (current) return;
          openSign(
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
        } else {
          setVote(target, current === option ? null : option);
        }
      });
    },
    [
      requireAuth,
      openSign,
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
        if (isFinalJurisdiction(target.jurisdiction)) {
          openSign(
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
        } else {
          commitSign(target);
        }
      });
    },
    [requireAuth, openSign, commitSign, state.kycTier, state.viewerDistricts],
  );

  // --- Compose flow --------------------------------------------------------
  const startCompose = useCallback(() => {
    requireAuth(() => {
      setState((s) => {
        const many = s.subscriptions.length > 1;
        return {
          ...s,
          composeOpen: true,
          composeStep: many ? "where" : "type",
          composeJur: many ? undefined : s.subscriptions[0]?.name,
          composeType: undefined,
          filterOpen: false,
          jurSelectorOpen: false,
        };
      });
    });
  }, [requireAuth]);

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
  const closeCompose = useCallback(
    () =>
      set({
        composeOpen: false,
        composeStep: "where",
        composeJur: undefined,
        composeType: undefined,
      }),
    [set],
  );

  const submitCompose = useCallback(() => {
    const jur = state.composeJur ?? "Global";
    const label = state.composeType
      ? RECORD_TYPE_LABEL[state.composeType]
      : "post";
    const finish = () => {
      closeCompose();
      notify(`${label} published (demo).`);
    };
    if (isFinalJurisdiction(jur)) {
      openSign(
        {
          kind: "compose" as SignKind,
          targetTitle: label,
          composeTypeLabel: label,
          showResidencyNotice: state.kycTier < 2,
          showAffectedNotice: false,
        },
        finish,
      );
    } else {
      finish();
    }
  }, [
    state.composeJur,
    state.composeType,
    state.kycTier,
    openSign,
    closeCompose,
    notify,
  ]);

  // --- Reply ---------------------------------------------------------------
  const startReply = useCallback(() => {
    requireAuth(() => set({ replyOpen: true }));
  }, [requireAuth, set]);
  const closeReply = useCallback(() => set({ replyOpen: false }), [set]);

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
    [state.loggedIn, state.kycTier, state.viewerDistricts],
  );
  const feedFilter = useMemo(
    () => feedFilterFromState(state),
    [
      state.subscriptions,
      state.includedKinds,
      state.verified,
      state.myDistricts,
      state.affected,
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
    react,
    reactionFor,
    reactionCountsFor,
    votePoll,
    voteFor,
    signPetition,
    petitionSigFor,
    hasSignedPetition,
    startCompose,
    selectComposeJurisdiction,
    selectComposeType,
    changeComposeType,
    submitCompose,
    closeCompose,
    confirmSign,
    closeSign,
    startReply,
    closeReply,
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
