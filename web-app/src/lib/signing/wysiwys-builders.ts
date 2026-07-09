import { RECORD_TYPE_LABEL } from "@/components/content";
import type { SignAction } from "@/lib/types";
import { signSchemeDisplay } from "./sign-scheme";
import { warningsForAction } from "./warning-eligibility";
import type {
  CommentWysiwysInput,
  ComposeWysiwysInput,
  ReactionWysiwysInput,
  SignatureWysiwysInput,
  TechnicalRow,
  VoteWysiwysInput,
  WysiwysActionInput,
  WysiwysBuilderContext,
  WysiwysPayload,
} from "./wysiwys-types";
import { entityTypeTag } from "./wysiwys-types";

function baseTechnicalRows(
  ctx: WysiwysBuilderContext,
  entityType: string,
  extras: TechnicalRow[] = [],
): TechnicalRow[] {
  const schemeRow: TechnicalRow = ctx.pendingSignChoice
    ? {
        label: "Sign scheme",
        value: "Quick or Passkey",
        wireTag: "p256|webauthn-es256+uv",
      }
    : (() => {
        const scheme = signSchemeDisplay(ctx.signMode ?? "passkey");
        return {
          label: "Sign scheme",
          value: scheme.label,
          wireTag: scheme.wireTag,
        };
      })();
  return [
    {
      label: "Jurisdiction",
      value: ctx.jurisdictionLabel,
      wireTag: ctx.jurisdictionId,
    },
    schemeRow,
    { label: "Entity type", value: entityType, wireTag: entityType },
    ...extras,
  ];
}

function buildVote(input: VoteWysiwysInput, ctx: WysiwysBuilderContext): WysiwysPayload {
  const warnings = warningsForAction(ctx.jurisdictionId, "vote", {
    kycTier: ctx.kycTier,
    outsideAffectedDistricts: ctx.outsideAffectedDistricts,
  });
  return {
    title: "Casting a Vote",
    leadLines: [`“${input.option}”`, `on “${input.pollTitle}”`],
    technicalRows: baseTechnicalRows(ctx, "vote", [
      { label: "Thread", value: input.threadId, wireTag: input.threadId },
      { label: "Poll", value: input.pollTitle, wireTag: input.pollId },
      { label: "Option", value: input.option, wireTag: input.option },
    ]),
    warnings,
    jurisdictionId: ctx.jurisdictionId,
    jurisdictionLabel: ctx.jurisdictionLabel,
  };
}

function buildSignature(
  input: SignatureWysiwysInput,
  ctx: WysiwysBuilderContext,
): WysiwysPayload {
  const warnings = warningsForAction(ctx.jurisdictionId, "signature", {
    kycTier: ctx.kycTier,
    outsideAffectedDistricts: ctx.outsideAffectedDistricts,
  });
  return {
    title: "Signing a Petition",
    leadLines: [`“${input.petitionTitle}”`],
    technicalRows: baseTechnicalRows(ctx, "petition_signature", [
      { label: "Thread", value: input.threadId, wireTag: input.threadId },
      { label: "Petition", value: input.petitionTitle, wireTag: input.petitionId },
    ]),
    warnings,
    jurisdictionId: ctx.jurisdictionId,
    jurisdictionLabel: ctx.jurisdictionLabel,
  };
}

function composeTitle(action: SignAction, kindLabel: string): string {
  if (action === "post.petition") return "Posting a New Petition";
  if (action === "post.poll") return "Posting a New Poll";
  return "Posting a New Statement";
}

function buildCompose(
  action: "post.statement" | "post.petition" | "post.poll",
  input: ComposeWysiwysInput,
  ctx: WysiwysBuilderContext,
): WysiwysPayload {
  const kindLabel = RECORD_TYPE_LABEL[input.kind] ?? input.kind;
  const warnings = warningsForAction(ctx.jurisdictionId, action, {
    kycTier: ctx.kycTier,
    outsideAffectedDistricts: ctx.outsideAffectedDistricts,
  });
  const leadLines = [`“${input.title}”`, input.body];
  if (input.kind === "poll" && input.pollOptions?.length) {
    const options = input.pollOptions.filter((o) => o.trim()).join(" · ");
    if (options) leadLines.push(`Options: ${options}`);
  }
  const extras: TechnicalRow[] = [
    { label: "Thread", value: input.threadId, wireTag: input.threadId },
    { label: "Record type", value: kindLabel, wireTag: entityTypeTag(action, input.kind) },
  ];
  if (input.districtSlugs?.length) {
    extras.push({
      label: "Districts",
      value: input.districtSlugs.join(", "),
      wireTag: input.districtSlugs.join(","),
    });
  }
  return {
    title: composeTitle(action, kindLabel),
    leadLines,
    technicalRows: baseTechnicalRows(ctx, entityTypeTag(action, input.kind), extras),
    warnings,
    jurisdictionId: ctx.jurisdictionId,
    jurisdictionLabel: ctx.jurisdictionLabel,
  };
}

function buildComment(input: CommentWysiwysInput, ctx: WysiwysBuilderContext): WysiwysPayload {
  const warnings = warningsForAction(ctx.jurisdictionId, "comment", {
    kycTier: ctx.kycTier,
    outsideAffectedDistricts: ctx.outsideAffectedDistricts,
  });
  return {
    title: "Posting a Comment",
    leadLines: [input.body, `on “${input.targetTitle}”`],
    technicalRows: baseTechnicalRows(ctx, "comment", [
      { label: "Thread", value: input.threadId, wireTag: input.threadId },
      { label: "Parent type", value: input.parentType, wireTag: input.parentType },
      { label: "Parent", value: input.targetTitle, wireTag: input.parentId },
    ]),
    warnings,
    jurisdictionId: ctx.jurisdictionId,
    jurisdictionLabel: ctx.jurisdictionLabel,
  };
}

function reactionDirectionLabel(direction: "up" | "down"): string {
  return direction === "up" ? "Agree" : "Disagree";
}

function buildReaction(input: ReactionWysiwysInput, ctx: WysiwysBuilderContext): WysiwysPayload {
  const warnings = warningsForAction(ctx.jurisdictionId, "reaction", {
    kycTier: ctx.kycTier,
    outsideAffectedDistricts: ctx.outsideAffectedDistricts,
  });
  const dirLabel = reactionDirectionLabel(input.direction);
  return {
    title: "Recording a Reaction",
    leadLines: [`${dirLabel} on “${input.targetTitle}”`],
    technicalRows: baseTechnicalRows(ctx, "reaction", [
      { label: "Thread", value: input.threadId, wireTag: input.threadId },
      { label: "Parent type", value: input.parentType, wireTag: input.parentType },
      { label: "Parent", value: input.targetTitle, wireTag: input.parentId },
      { label: "Reaction", value: dirLabel, wireTag: input.wireKind },
    ]),
    warnings,
    jurisdictionId: ctx.jurisdictionId,
    jurisdictionLabel: ctx.jurisdictionLabel,
  };
}

/** Canonical WYSIWYS payload builder — one entry point per civic write action. */
export function buildWysiwysForAction(
  payload: WysiwysActionInput,
  ctx: WysiwysBuilderContext,
): WysiwysPayload {
  switch (payload.action) {
    case "vote":
      return buildVote(payload.input, ctx);
    case "signature":
      return buildSignature(payload.input, ctx);
    case "post.statement":
    case "post.petition":
    case "post.poll":
      return buildCompose(payload.action, payload.input, ctx);
    case "comment":
      return buildComment(payload.input, ctx);
    case "reaction":
      return buildReaction(payload.input, ctx);
  }
}
