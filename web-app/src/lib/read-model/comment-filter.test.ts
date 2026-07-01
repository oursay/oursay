import { describe, expect, it } from "vitest";
import { COMMENTS_STATEMENT, POST_STATEMENT } from "@/lib/mock";
import { ANON_VIEWER } from "@/lib/types";
import { commentKeep } from "./comment-filter";

describe("commentKeep — Signed filter ladder", () => {
  const openPost = POST_STATEMENT;

  it("Passkey drops signTier 0 comments", () => {
    const unsigned = COMMENTS_STATEMENT[1]; // Marcus Lee
    expect(
      commentKeep(unsigned, openPost, ANON_VIEWER, { signedFilter: 1 }),
    ).toBe(false);
  });

  it("Passkey keeps signTier 1 comments", () => {
    const passkey = COMMENTS_STATEMENT[0]; // Sam Driver
    expect(passkey.signTier).toBe(1);
    expect(
      commentKeep(passkey, openPost, ANON_VIEWER, { signedFilter: 1 }),
    ).toBe(true);
  });

  it("Biometric keeps signTier 2+ only", () => {
    const passkey = COMMENTS_STATEMENT[0];
    const biometric = COMMENTS_STATEMENT[0].replies[0]; // Rae Nguyen
    expect(biometric.signTier).toBe(2);
    expect(
      commentKeep(passkey, openPost, ANON_VIEWER, { signedFilter: 2 }),
    ).toBe(false);
    expect(
      commentKeep(biometric, openPost, ANON_VIEWER, { signedFilter: 2 }),
    ).toBe(true);
  });

  it("Any keeps all comments when signedFilter is 0", () => {
    const unsigned = COMMENTS_STATEMENT[1];
    expect(
      commentKeep(unsigned, openPost, ANON_VIEWER, { signedFilter: 0 }),
    ).toBe(true);
  });
});
