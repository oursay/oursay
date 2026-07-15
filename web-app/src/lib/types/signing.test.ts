import { describe, expect, it } from "vitest";
import {
  applyRememberedSignChoice,
  DEFAULT_SIGNING,
  effectiveSignMethod,
} from "./signing";

describe("applyRememberedSignChoice", () => {
  it("leaves prefs unchanged when remember is false", () => {
    const next = applyRememberedSignChoice(
      DEFAULT_SIGNING,
      "signature",
      "quick",
      false,
    );
    expect(next).toBe(DEFAULT_SIGNING);
    expect(next.signature).toBe("ask");
  });

  it("persists Quick for the chosen action only", () => {
    const next = applyRememberedSignChoice(
      DEFAULT_SIGNING,
      "signature",
      "quick",
      true,
    );
    expect(next.signature).toBe("quick");
    expect(next.vote).toBe("ask");
    expect(effectiveSignMethod(next.signature, "quick")).toBe("quick");
  });

  it("persisting Passkey raises the account pref without implying a silent sign", () => {
    const next = applyRememberedSignChoice(
      DEFAULT_SIGNING,
      "vote",
      "passkey",
      true,
    );
    expect(next.vote).toBe("passkey");
    // Effective passkey still uses the WYSIWYS confirm + OS passkey popup.
    expect(effectiveSignMethod(next.vote, "quick")).toBe("passkey");
  });
});
