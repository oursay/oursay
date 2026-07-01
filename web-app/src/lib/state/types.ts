import type {
  ActivityKind,
  JurisdictionMembership,
  RecordKind,
  VerificationTier,
} from "@/lib/types";
import type { ComposeStep, SignKind } from "@/components";

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

  // Feed / list filters.
  includedKinds: RecordKind[];
  verified: VerificationTier;
  myDistricts: boolean;
  affected: boolean;

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

  // Alberta sign confirmation (null when closed).
  sign: SignRequest | null;

  // Stubbed civic write state (keyed by record id).
  reactions: Record<string, "up" | "down" | null>;
  /** Overridden agree/disagree totals after the viewer reacts. */
  reactionCounts: Record<string, { up: number; down: number }>;
  votes: Record<string, string>;
  /** Overridden signature totals (petition graduation demo). */
  petitionSig: Record<string, number>;

  // Post reply composer.
  replyOpen: boolean;

  // View coordination (set by the active view for the shared chrome).
  pageJurisdiction: string | null;
  postAffectedEligible: boolean;

  // Transient "not built" toast.
  toast: string | null;
}
