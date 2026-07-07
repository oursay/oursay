import { describe, expect, it } from "vitest";
import { custodyBindingStorageKey } from "@oursay/identity/client/browser";
import {
  parentTypeForKind,
  reactionKindForDir,
  resolveCivicSignMode,
} from "./civic-helpers";
import { DEFAULT_SIGNING } from "@/lib/types";

describe("civic-helpers", () => {
  it("maps agree/disagree to check/cross", () => {
    expect(reactionKindForDir("up")).toBe("check");
    expect(reactionKindForDir("down")).toBe("cross");
  });

  it("maps record kinds to parent types", () => {
    expect(parentTypeForKind("statement")).toBe("post");
    expect(parentTypeForKind("petition")).toBe("petition");
    expect(parentTypeForKind("poll")).toBe("poll");
  });

  it("resolves sign mode from chooser pick", () => {
    expect(
      resolveCivicSignMode("reaction", "oursay-global", DEFAULT_SIGNING, "passkey"),
    ).toBe("passkey");
  });

  it("resolves quick when prefs and jurisdiction allow", () => {
    expect(resolveCivicSignMode("reaction", "oursay-global", DEFAULT_SIGNING)).toBe(
      "quick",
    );
  });

  it("raises to passkey when jurisdiction mandates it", () => {
    expect(resolveCivicSignMode("vote", "ab-ca-gov", DEFAULT_SIGNING)).toBe("passkey");
  });

  it("uses stable custody binding storage key", () => {
    expect(custodyBindingStorageKey("user-1")).toBe("oursay/custody-binding/user-1");
  });
});
