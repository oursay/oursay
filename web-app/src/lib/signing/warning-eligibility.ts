import { gateFor } from "@/lib/mock/gates";
import type {
  GateActor,
  GatedAction,
  JurisdictionId,
  SignAction,
  VerificationTier,
} from "@/lib/types";
import type { WysiwysWarning } from "./wysiwys-types";
import { jurisdictionLabel } from "@/lib/mock";

export interface JurisdictionRules {
  allowChange: boolean;
  allowRevoke: boolean;
}

/** Mirror of `jurisdiction-data` `rules` — drives irrevocability warnings. */
export const JURISDICTION_RULES: Record<string, JurisdictionRules> = {
  "oursay-global": { allowChange: true, allowRevoke: true },
  "ab-ca-gov": { allowChange: false, allowRevoke: false },
};

const DEFAULT_RULES: JurisdictionRules = { allowChange: true, allowRevoke: true };

export function jurisdictionRules(jurisdictionId: JurisdictionId): JurisdictionRules {
  return JURISDICTION_RULES[jurisdictionId] ?? DEFAULT_RULES;
}

/** Whether votes may be changed after submission in this jurisdiction. */
export function jurisdictionAllowsVoteChange(jurisdictionId: JurisdictionId): boolean {
  return jurisdictionRules(jurisdictionId).allowChange;
}

const SIGN_ACTION_TO_GATED_LOCAL: Record<SignAction, GatedAction> = {
  "post.statement": "post",
  "post.petition": "petition",
  "post.poll": "poll",
  signature: "petition_signature",
  vote: "vote",
  comment: "comment",
  reaction: "reaction",
};

function gatedActionForSignAction(action: SignAction): GatedAction {
  return SIGN_ACTION_TO_GATED_LOCAL[action];
}

function meetsActor(actor: GateActor, kycTier: VerificationTier): boolean {
  if (actor === "anyone") return true;
  if ("tiers" in actor) return actor.tiers.some((t) => kycTier >= t);
  if ("residencyIn" in actor) return kycTier >= 2;
  return true;
}

type ActorRequirement = "identity" | "residency";

/**
 * Whether an unmet actor gate reads as an ID (identity) or residency requirement.
 * `residencyIn`, or a tier set whose floor is residency-verified (≥ 2), ⇒ residency;
 * a lower tier floor (identity-verified) ⇒ identity.
 */
function actorRequirement(actor: GateActor): ActorRequirement {
  if (typeof actor === "string") return "identity";
  if ("residencyIn" in actor) return "residency";
  if ("tiers" in actor) return Math.min(...actor.tiers) >= 2 ? "residency" : "identity";
  return "identity";
}

function requirementPhrase(req: ActorRequirement): string {
  return req === "residency" ? "requires verified residency" : "requires ID verification";
}

/** True when the viewer fails the action's official-count floor (soft — they can still act). */
export function belowOfficialCountFloor(
  jurisdictionId: JurisdictionId,
  action: SignAction,
  kycTier: VerificationTier,
): boolean {
  const gate = gateFor(jurisdictionId, gatedActionForSignAction(action));
  if (!gate.officialCount) return false;
  return !meetsActor(gate.officialCount, kycTier);
}

/** Actions that may show residency / official-count eligibility warnings. */
export function actionShowsResidencyWarning(action: SignAction): boolean {
  return action === "vote" || action === "signature" || action === "post.petition";
}

/** Actions that may show irrevocability warnings per current jurisdiction rules. */
export function actionIsIrrevocable(
  jurisdictionId: JurisdictionId,
  action: SignAction,
): boolean {
  const rules = jurisdictionRules(jurisdictionId);
  if (action === "vote") return !rules.allowChange;
  if (action === "signature") return !rules.allowRevoke;
  return false;
}

export interface WarningEligibilityContext {
  kycTier: VerificationTier;
  outsideAffectedDistricts: boolean;
  /** True when the viewer already completed this one-per-user action (vote/signature). */
  alreadyActed?: boolean;
}

function irrevocableNoun(action: SignAction): string | undefined {
  if (action === "vote") return "ballots";
  if (action === "signature") return "petition signatures";
  return undefined;
}

function alreadyActedReason(action: SignAction): string {
  if (action === "vote") return "You've already cast your vote on this poll.";
  if (action === "signature") return "You've already signed this petition.";
  return "You've already completed this action.";
}

/**
 * Jurisdiction-aware warnings for WYSIWYS — single source of truth.
 * Per current jurisdiction config; not hardcoded to Alberta id alone.
 */
export function warningsForAction(
  jurisdictionId: JurisdictionId,
  action: SignAction,
  ctx: WarningEligibilityContext,
): WysiwysWarning[] {
  const label = jurisdictionLabel(jurisdictionId);
  const gate = gateFor(jurisdictionId, gatedActionForSignAction(action));

  // Already completed an irreversible one-per-user action → cannot do it again.
  // Supersedes every other notice — show it alone.
  if (ctx.alreadyActed && actionIsIrrevocable(jurisdictionId, action)) {
    return [
      {
        kind: "already-acted",
        jurisdictionId,
        jurisdictionLabel: label,
        reason: alreadyActedReason(action),
      },
    ];
  }

  // Hard block: the viewer fails the action's `act` gate and cannot participate at
  // all. When present it supersedes the softer notices — show it alone.
  if (!meetsActor(gate.act, ctx.kycTier)) {
    return [
      {
        kind: "blocker",
        jurisdictionId,
        jurisdictionLabel: label,
        reason: requirementPhrase(actorRequirement(gate.act)),
      },
    ];
  }

  const warnings: WysiwysWarning[] = [];

  if (actionIsIrrevocable(jurisdictionId, action)) {
    const noun = irrevocableNoun(action);
    if (noun) {
      warnings.push({
        kind: "irrevocable",
        jurisdictionId,
        jurisdictionLabel: label,
        irrevocableNoun: noun,
      });
    }
  }

  // Soft official-count floor: the viewer can act, but it won't count officially
  // until they clear an ID or residency requirement.
  if (
    actionShowsResidencyWarning(action) &&
    gate.officialCount &&
    !meetsActor(gate.officialCount, ctx.kycTier)
  ) {
    warnings.push({
      kind: "count-floor",
      jurisdictionId,
      jurisdictionLabel: label,
      countBasis: actorRequirement(gate.officialCount),
    });
  }

  if (
    (action === "vote" || action === "signature") &&
    ctx.kycTier >= 2 &&
    ctx.outsideAffectedDistricts
  ) {
    warnings.push({
      kind: "affected",
      jurisdictionId,
      jurisdictionLabel: label,
    });
  }

  return warnings;
}
