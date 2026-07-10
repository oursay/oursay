import type { CivicParentType, CivicSignMode } from "@/lib/api/civic-helpers";
import type { RecordKind, SignAction, VerificationTier } from "@/lib/types";

export interface TechnicalRow {
  label: string;
  value: string;
  wireTag?: string;
  /** "paragraph" wraps the value onto its own lines; "inline" (default) stays on one line. */
  variant?: "inline" | "paragraph";
}

export type WysiwysWarningKind =
  | "irrevocable"
  | "count-floor"
  | "affected"
  | "blocker"
  | "already-acted";

/** Warning kinds that make the action impossible — signing must be disabled. */
export function warningBlocksSigning(kind: WysiwysWarningKind): boolean {
  return kind === "blocker" || kind === "already-acted";
}

export interface WysiwysWarning {
  kind: WysiwysWarningKind;
  jurisdictionId: string;
  jurisdictionLabel: string;
  /** Action-specific noun for irrevocability copy (e.g. "ballots", "petition signatures"). */
  irrevocableNoun?: string;
  /** count-floor: whether the official-count floor is an ID (identity) or residency requirement. */
  countBasis?: "identity" | "residency";
  /** blocker: short phrase describing the unmet requirement (e.g. "require verified residency"). */
  reason?: string;
}

/** Presentation payload for the WysiwysPreview component. */
export interface WysiwysPayload {
  title: string;
  technicalRows: TechnicalRow[];
  warnings: WysiwysWarning[];
  jurisdictionId: string;
  jurisdictionLabel: string;
}

export interface WysiwysBuilderContext {
  jurisdictionId: string;
  jurisdictionLabel: string;
  kycTier: VerificationTier;
  outsideAffectedDistricts: boolean;
  /** Effective sign mode for technical rows; omit when the user will choose in-modal. */
  signMode?: CivicSignMode;
  /** True when Ask mode — signer picks Quick or Passkey on the same modal. */
  pendingSignChoice?: boolean;
  /** True when the viewer already completed this one-per-user action (vote/signature). */
  alreadyActed?: boolean;
}

export interface VoteWysiwysInput {
  threadId: string;
  pollId: string;
  pollTitle: string;
  option: string;
}

export interface SignatureWysiwysInput {
  threadId: string;
  petitionId: string;
  petitionTitle: string;
}

export interface ComposeWysiwysInput {
  threadId: string;
  kind: RecordKind;
  title: string;
  body: string;
  pollOptions?: string[];
  districtSlugs?: string[];
}

export interface CommentWysiwysInput {
  threadId: string;
  parentId: string;
  parentType: CivicParentType;
  targetTitle: string;
  body: string;
}

export interface ReactionWysiwysInput {
  threadId: string;
  parentId: string;
  parentType: CivicParentType;
  targetTitle: string;
  direction: "up" | "down";
  wireKind: "check" | "cross";
}

export type WysiwysActionInput =
  | { action: "vote"; input: VoteWysiwysInput }
  | { action: "signature"; input: SignatureWysiwysInput }
  | { action: "post.statement"; input: ComposeWysiwysInput }
  | { action: "post.petition"; input: ComposeWysiwysInput }
  | { action: "post.poll"; input: ComposeWysiwysInput }
  | { action: "comment"; input: CommentWysiwysInput }
  | { action: "reaction"; input: ReactionWysiwysInput };

export type ComposeSignAction = "post.statement" | "post.petition" | "post.poll";

export function composeActionForKind(kind: RecordKind): ComposeSignAction {
  if (kind === "petition") return "post.petition";
  if (kind === "poll") return "post.poll";
  return "post.statement";
}

export function entityTypeTag(action: SignAction, composeKind?: RecordKind): string {
  switch (action) {
    case "vote":
      return "vote";
    case "signature":
      return "petition_signature";
    case "comment":
      return "comment";
    case "reaction":
      return "reaction";
    case "post.statement":
      return "post";
    case "post.petition":
      return "petition";
    case "post.poll":
      return "poll";
    default:
      return composeKind ?? "post";
  }
}
