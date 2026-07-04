import type {
  ActivityKind,
  AuthorGeoRelation,
  AuthorIdentity,
  AuthorVisibility,
  GeoFilterMode,
  JurisdictionMembership,
  RecordKind,
  SigningPrefs,
  SignTier,
  SignedFilterLevel,
  VerificationTier,
} from "@/lib/types";
import type { ComposeStep, SignKind } from "@/components";

/**
 * A viewer's own reaction on a record/comment. `signTier` records the action
 * signing tier when persisted (future surfaces; no badge UI yet).
 */
export interface ViewerReaction {
  dir: "up" | "down";
  signTier?: SignTier;
}

/**
 * A pending "Ask" signing choice (Quick Sign vs Sign with Passkey). Raised when
 * the effective method for an action is `ask` and the jurisdiction doesn't
 * mandate passkey. The commit is held in a ref; this only carries the copy.
 */
export interface ChooseSignRequest {
  /** Bold summary line, e.g. "Cast your vote". */
  title: string;
  /** Supporting lines naming the target/option. */
  lines: string[];
}

/**
 * A pending Alberta WYSIWYS confirmation. The commit itself is held in a ref (a
 * closure over the target), so this only carries what the SignModal renders.
 */
export interface SignRequest {
  kind: SignKind;
  targetTitle: string;
  /** Poll: the option being cast. */
  option?: string;
  /** Compose: the record type label being published. */
  composeTypeLabel?: string;
  /** Below-residency signer — their action won't count officially yet. */
  showResidencyNotice: boolean;
  /** Residency-verified but outside the record's districts. */
  showAffectedNotice: boolean;
  /** Ledger-final (jurisdiction-mandated passkey) vs a standing passkey pref. */
  isFinal?: boolean;
  /** Jurisdiction name for the modal copy. */
  jurisdiction?: string;
}

/**
 * The record/comment being shared, plus everything the ShareModal needs to
 * render its preview card and build the share link/text. Held in global state
 * (null when closed) so any card — feed list, post detail, or comment — can
 * raise the same sheet, mirroring the sign/compose modal pattern.
 */
export interface ShareTarget {
  /** Post/record vs comment — drives the preview card layout. */
  variant: "record" | "comment";
  /** Stable key for the once-per-account share tally (record id / comment key). */
  shareKey: string;
  /** In-app path to the shared record (the share-link target). */
  path: string;
  /** Record kind (records only). */
  recordKind?: RecordKind;
  author: string;
  handle?: string;
  tier: VerificationTier;
  signTier?: SignTier;
  authorGeo?: AuthorGeoRelation;
  identity?: AuthorIdentity;
  /** Records: the title line. */
  title?: string;
  body: string[];
  /** Comments: the relative timestamp shown in the header. */
  timestamp?: string;
  /** Comments: nesting depth (drives badge modes in the preview header). */
  depth?: number;
}

/**
 * Client-side app state, mirroring the wireframe's global `state` object. Reads
 * are open; only writes are gated (requireAuth). The read-model helpers stay
 * pure — this derives a ViewerContext + FeedFilterParams for them.
 */
export interface AppState {
  // Session / viewer.
  loggedIn: boolean;
  kycTier: VerificationTier;
  viewerDistricts: string[];
  /** Account-default profile visibility (persisted; docs/09 cascade base). */
  accountVisibility: AuthorVisibility;
  /** Registered passkey/device labels (wireframe deviceCount). */
  devices: string[];
  /** Light/dark preference — drives the `dark` class on <html> (see global.css). */
  theme: "light" | "dark";
  /** Per-action signing method (Ask/Quick/Passkey); jurisdiction may raise it. */
  signing: SigningPrefs;

  // Feed / list filters.
  includedKinds: RecordKind[];
  verified: VerificationTier;
  myDistricts: GeoFilterMode;
  affected: GeoFilterMode;
  /** Author-residence filter — see Geography.myJurisdiction. */
  myJurisdiction: GeoFilterMode;
  /** Which geography filter last entered exclusive (conflict tie-break). */
  geoPriority: "myDistricts" | "affected";
  /** Signed Refine ladder: 0 Any · 1 Passkey · 2 Biometric (Biometric dev-only). */
  signedFilter: SignedFilterLevel;

  // Profile Activity-type filter (a distinct taxonomy from record kinds).
  profileTypes: ActivityKind[];

  // Jurisdiction subscriptions (persisted to a cookie; Global default).
  subscriptions: JurisdictionMembership[];

  // Chrome popovers.
  filterOpen: boolean;
  jurSelectorOpen: boolean;

  // Modal flags.
  authOpen: boolean;
  registerOpen: boolean;
  otpOpen: boolean;
  loginOpen: boolean;
  /** Wireframe state.loginOtpWindow — shows the email-OTP login path. */
  loginOtpWindow: boolean;
  profileOpen: boolean;
  addJurOpen: boolean;

  // Compose flow.
  composeOpen: boolean;
  composeStep: ComposeStep;
  composeJur?: string;
  composeType?: RecordKind;
  /** Per-post visibility override (defaults to accountVisibility; may widen or narrow); cleared on close. */
  composeVisibility?: AuthorVisibility;

  // Alberta sign confirmation (null when closed).
  sign: SignRequest | null;
  // Quick-vs-Passkey chooser for "Ask" actions (null when closed).
  choose: ChooseSignRequest | null;
  // Share sheet target (null when closed).
  share: ShareTarget | null;

  // Stubbed civic write state (keyed by record id).
  reactions: Record<string, ViewerReaction | null>;
  /** Overridden agree/disagree totals after the viewer reacts. */
  reactionCounts: Record<string, { up: number; down: number }>;
  votes: Record<string, string>;
  /** Overridden signature totals (petition graduation demo). */
  petitionSig: Record<string, number>;
  /** Records/comments the account has shared (once per account; bumps the count). */
  shared: Record<string, true>;

  // Post reply composer.
  replyOpen: boolean;

  // View coordination (set by the active view for the shared chrome).
  pageJurisdiction: string | null;
  /** The open detail post's district slugs (null off the Post view). */
  postDistricts: string[] | null;

  // Transient "not built" toast.
  toast: string | null;
}
