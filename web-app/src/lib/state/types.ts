import type { AuthPasskey } from "@/lib/api/auth";
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
import type { ComposeStep } from "@/components";
import type { AuthModal } from "./authModal";
import type { PasskeyBusy } from "./passkeyBusy";
import type { WysiwysPayload } from "@/lib/signing";

/**
 * A viewer's own reaction on a record/comment. `signTier` records the action
 * signing tier when persisted (future surfaces; no badge UI yet).
 */
export interface ViewerReaction {
  dir: "up" | "down";
  signTier?: SignTier;
  /** Civic singleton entity id — used to update rather than recreate reactions. */
  entityId?: string;
}

/**
 * Pending unified civic signing confirmation. The commit is held in a ref;
 * this carries the WYSIWYS payload and which sign buttons to show.
 */
export interface SigningConfirmRequest {
  wysiwys: WysiwysPayload;
  /** False when effective method is passkey-only (Quick Sign hidden). */
  showQuickSign: boolean;
  /** Thread id for passkey busy-phase pre-check (per-device thread credential). */
  threadId: string;
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
  /** Comments: stable entity id — used to resolve the public preview when handle differs. */
  commentId?: string;
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
  /** Live-session wire handle (no leading @). */
  accountHandle?: string;
  /** Live-session display name from `/v1/profile`. */
  accountDisplayName?: string;
  /** Account-default profile visibility (persisted; docs/09 cascade base). */
  accountVisibility: AuthorVisibility;
  /** Enrolled account-login passkeys (live API or mock wireframe). */
  passkeys: AuthPasskey[];
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
  /** The single open auth dialog (chooser/register/login/recover/otp) — one at a time. */
  authModal: AuthModal;
  profileOpen: boolean;
  /** Verify ID / Verify Residency chooser. */
  verifyOpen: boolean;
  addJurOpen: boolean;

  // Compose flow.
  composeOpen: boolean;
  composeStep: ComposeStep;
  composeJur?: string;
  composeType?: RecordKind;
  /** Per-post visibility override (defaults to accountVisibility; may widen or narrow); cleared on close. */
  composeVisibility?: AuthorVisibility;
  /** Compose editor draft (cleared on close). */
  composeTitle: string;
  composeBody: string;
  composePollOptions: string[];
  /** Affected district slugs for the draft post ([] = whole jurisdiction). */
  composeDistricts: string[];

  // Unified civic signing confirmation (null when closed).
  signingConfirm: SigningConfirmRequest | null;
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
  /** Server-reported share totals (live mode; keyed by shareKey). */
  shareCounts: Record<string, number>;

  // Address editor (live settings).
  addressOpen: boolean;
  replyOpen: boolean;

  // View coordination (set by the active view for the shared chrome).
  pageJurisdiction: string | null;
  /** The open detail post's district slugs (null off the Post view). */
  postDistricts: string[] | null;

  // Transient "not built" toast.
  toast: string | null;

  /** In-modal passkey busy overlay (dim/spinner while WebAuthn is open). */
  passkeyBusy: PasskeyBusy | null;
}
