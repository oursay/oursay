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

/** ThreadID row — rendered purely as a wire tag (no plain-text value). */
function threadRow(threadId: string): TechnicalRow {
  return { label: "ThreadID", value: "", wireTag: threadId };
}

function buildVote(input: VoteWysiwysInput, ctx: WysiwysBuilderContext): WysiwysPayload {
  const warnings = warningsForAction(ctx.jurisdictionId, "vote", {
    kycTier: ctx.kycTier,
    outsideAffectedDistricts: ctx.outsideAffectedDistricts,
  });
  return {
    title: "Casting a Vote",
    technicalRows: [
      { label: "Poll", value: input.pollTitle, variant: "paragraph" },
      { label: "Option", value: input.option, variant: "paragraph" },
      ...baseTechnicalRows(ctx, "vote", [threadRow(input.threadId)]),
    ],
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
    technicalRows: [
      { label: "Petition", value: input.petitionTitle, variant: "paragraph" },
      ...baseTechnicalRows(ctx, "petition_signature", [threadRow(input.threadId)]),
    ],
    warnings,
    jurisdictionId: ctx.jurisdictionId,
    jurisdictionLabel: ctx.jurisdictionLabel,
  };
}

function composeTitle(action: SignAction): string {
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
  const paragraphs: TechnicalRow[] = [
    { label: "Title", value: input.title, variant: "paragraph" },
    { label: "Body", value: input.body, variant: "paragraph" },
  ];
  if (input.kind === "poll" && input.pollOptions?.length) {
    const options = input.pollOptions.filter((o) => o.trim()).join(" · ");
    if (options) paragraphs.push({ label: "Options", value: options, variant: "paragraph" });
  }
  const extras: TechnicalRow[] = [
    threadRow(input.threadId),
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
    title: composeTitle(action),
    technicalRows: [
      ...paragraphs,
      ...baseTechnicalRows(ctx, entityTypeTag(action, input.kind), extras),
    ],
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
    technicalRows: [
      { label: "Comment", value: input.body, variant: "paragraph" },
      { label: "Parent", value: input.targetTitle, wireTag: input.parentId, variant: "paragraph" },
      ...baseTechnicalRows(ctx, "comment", [
        threadRow(input.threadId),
        { label: "Parent type", value: input.parentType, wireTag: input.parentType },
      ]),
    ],
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
    technicalRows: [
      { label: "Parent", value: input.targetTitle, wireTag: input.parentId, variant: "paragraph" },
      ...baseTechnicalRows(ctx, "reaction", [
        threadRow(input.threadId),
        { label: "Parent type", value: input.parentType, wireTag: input.parentType },
        { label: "Reaction", value: dirLabel, wireTag: input.wireKind },
      ]),
    ],
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
