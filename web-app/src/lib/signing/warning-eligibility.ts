import { gateFor } from "@/lib/mock/gates";
import type {
  ActionGate,
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

function officialCountActor(gate: ActionGate): GateActor | undefined {
  return gate.officialCount ?? gate.act;
}

/** True when the viewer is below the official-count floor for this gate. */
export function belowOfficialCountFloor(
  jurisdictionId: JurisdictionId,
  action: SignAction,
  kycTier: VerificationTier,
): boolean {
  const gate = gateFor(jurisdictionId, gatedActionForSignAction(action));
  const actor = officialCountActor(gate);
  if (!actor) return false;
  return !meetsActor(actor, kycTier);
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
}

function irrevocableNoun(action: SignAction): string | undefined {
  if (action === "vote") return "ballots";
  if (action === "signature") return "petition signatures";
  return undefined;
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

  if (
    actionShowsResidencyWarning(action) &&
    belowOfficialCountFloor(jurisdictionId, action, ctx.kycTier)
  ) {
    warnings.push({
      kind: "residency",
      jurisdictionId,
      jurisdictionLabel: label,
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
