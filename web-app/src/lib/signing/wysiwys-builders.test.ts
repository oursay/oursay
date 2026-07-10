import { describe, expect, it } from "vitest";
import { encodeUuidV4Base59 } from "@oursay/encode";
import { ALBERTA_ID, GLOBAL_ID } from "@/lib/types";
import { buildWysiwysForAction } from "./wysiwys-builders";

const baseCtx = {
  jurisdictionId: ALBERTA_ID,
  jurisdictionLabel: "Alberta",
  kycTier: 2 as const,
  outsideAffectedDistricts: false,
  signMode: "passkey" as const,
};

describe("buildWysiwysForAction", () => {
  it("vote title and lead include option", () => {
    const payload = buildWysiwysForAction(
      {
        action: "vote",
        input: {
          threadId: "thread-1",
          pollId: "poll-1",
          pollTitle: "Budget vote",
          option: "Yes",
        },
      },
      baseCtx,
    );
    expect(payload.title).toBe("Casting a Vote");
    const option = payload.technicalRows.find((r) => r.label === "Option");
    const poll = payload.technicalRows.find((r) => r.label === "Poll");
    expect(option?.value).toBe("Yes");
    expect(option?.variant).toBe("paragraph");
    expect(poll?.value).toBe("Budget vote");
    expect(poll?.variant).toBe("paragraph");
  });

  it("technical rows include jurisdiction id and sign scheme", () => {
    const payload = buildWysiwysForAction(
      {
        action: "comment",
        input: {
          threadId: "t-1",
          parentId: "p-1",
          parentType: "post",
          targetTitle: "My post",
          body: "Hello world",
        },
      },
      { ...baseCtx, jurisdictionId: GLOBAL_ID, jurisdictionLabel: "Global", signMode: "quick" },
    );
    const jur = payload.technicalRows.find((r) => r.label === "Jurisdiction");
    const scheme = payload.technicalRows.find((r) => r.label === "Sign scheme");
    expect(jur?.wireTag).toBe(GLOBAL_ID);
    expect(scheme?.wireTag).toBe("p256");
    const comment = payload.technicalRows.find((r) => r.label === "Comment");
    expect(comment?.value).toBe("Hello world");
    expect(comment?.variant).toBe("paragraph");
  });

  it("ask mode shows pending sign scheme row", () => {
    const payload = buildWysiwysForAction(
      {
        action: "vote",
        input: {
          threadId: "t",
          pollId: "p",
          pollTitle: "Q",
          option: "A",
        },
      },
      { ...baseCtx, pendingSignChoice: true, signMode: undefined },
    );
    const scheme = payload.technicalRows.find((r) => r.label === "Sign scheme");
    expect(scheme?.value).toBe("Quick or Passkey");
    expect(scheme?.wireTag).toBe("p256|webauthn-es256+uv");
  });

  it("shows ThreadID as Base59 with raw UUID in the wire tag", () => {
    const threadId = "550e8400-e29b-41d4-a716-446655440000";
    const payload = buildWysiwysForAction(
      {
        action: "vote",
        input: {
          threadId,
          pollId: "poll-1",
          pollTitle: "Budget vote",
          option: "Yes",
        },
      },
      baseCtx,
    );
    const thread = payload.technicalRows.find((r) => r.label === "ThreadID");
    expect(thread?.value).toBe(encodeUuidV4Base59(threadId));
    expect(thread?.wireTag).toBe(threadId);
  });

  it("keeps mock thread ids as a single visible value without a duplicate tag", () => {
    const payload = buildWysiwysForAction(
      {
        action: "comment",
        input: {
          threadId: "pet-sam-109st",
          parentId: "p-1",
          parentType: "post",
          targetTitle: "My post",
          body: "Hello",
        },
      },
      baseCtx,
    );
    const thread = payload.technicalRows.find((r) => r.label === "ThreadID");
    expect(thread?.value).toBe("pet-sam-109st");
    expect(thread?.wireTag).toBe("pet-sam-109st");
  });

  it("shows Parent title with Base59 slug instead of raw UUID", () => {
    const parentId = "550e8400-e29b-41d4-a716-446655440000";
    const payload = buildWysiwysForAction(
      {
        action: "reaction",
        input: {
          threadId: parentId,
          parentId,
          parentType: "post",
          targetTitle: "Budget petition",
          direction: "up",
          wireKind: "check",
        },
      },
      baseCtx,
    );
    const parent = payload.technicalRows.find((r) => r.label === "Parent");
    expect(parent?.value).toBe("Budget petition");
    expect(parent?.wireTag).toBe(encodeUuidV4Base59(parentId));
    expect(parent?.wireTag).not.to.include("-");
  });
});
