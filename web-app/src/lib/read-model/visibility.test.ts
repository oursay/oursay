import { describe, expect, it } from "vitest";
import type { AuthorVisibility, VerificationTier, ViewerContext } from "@/lib/types";
import { isRevealed, resolveVisibility, VISIBILITY_NARROWNESS } from "./visibility";

function viewer(kycTier: VerificationTier, viewerDistricts: string[] = []): ViewerContext {
  return { loggedIn: kycTier > 0, kycTier, viewerDistricts };
}

const MY = ["edmonton-strathcona"];
const SHARED = ["edmonton-strathcona"]; // author in the viewer's riding
const ELSEWHERE = ["calgary-elbow"]; // author in another riding
const GLOBAL: string[] = []; // district-less / Global author

describe("isRevealed matrix", () => {
  it("public reveals to everyone including logged out", () => {
    for (const t of [0, 1, 2, 3] as const) {
      expect(isRevealed("public", ELSEWHERE, viewer(t))).toBe(true);
    }
  });

  it("anonymous never reveals, even to overlapping officials", () => {
    for (const t of [0, 1, 2, 3] as const) {
      expect(isRevealed("anonymous", SHARED, viewer(t, MY))).toBe(false);
    }
  });

  it("id_verified reveals from tier 1 up, regardless of districts", () => {
    expect(isRevealed("id_verified", ELSEWHERE, viewer(0))).toBe(false);
    expect(isRevealed("id_verified", ELSEWHERE, viewer(1))).toBe(true);
    expect(isRevealed("id_verified", GLOBAL, viewer(2, MY))).toBe(true);
    expect(isRevealed("id_verified", ELSEWHERE, viewer(3, MY))).toBe(true);
  });

  it("my_jurisdiction needs residency; Global authors count as shared", () => {
    expect(isRevealed("my_jurisdiction", ELSEWHERE, viewer(1))).toBe(false);
    // Residency-verified Alberta viewer sees Alberta authors in other ridings.
    expect(isRevealed("my_jurisdiction", ELSEWHERE, viewer(2, MY))).toBe(true);
    // District-less (Global) author reveals to any residency-verified viewer.
    expect(isRevealed("my_jurisdiction", GLOBAL, viewer(2, MY))).toBe(true);
    // Tier 2 without districts (shouldn't happen in demo) stays hidden for
    // district-bearing authors.
    expect(isRevealed("my_jurisdiction", ELSEWHERE, viewer(2, []))).toBe(false);
  });

  it("my_district needs residency plus a shared riding", () => {
    expect(isRevealed("my_district", SHARED, viewer(1, MY))).toBe(false);
    expect(isRevealed("my_district", SHARED, viewer(2, MY))).toBe(true);
    expect(isRevealed("my_district", ELSEWHERE, viewer(2, MY))).toBe(false);
    expect(isRevealed("my_district", ELSEWHERE, viewer(3, MY))).toBe(false);
    expect(isRevealed("my_district", GLOBAL, viewer(2, MY))).toBe(false);
  });

  it("all_officials reveals only to tier-3 viewers", () => {
    expect(isRevealed("all_officials", ELSEWHERE, viewer(2, MY))).toBe(false);
    expect(isRevealed("all_officials", ELSEWHERE, viewer(3, MY))).toBe(true);
    expect(isRevealed("all_officials", GLOBAL, viewer(3, MY))).toBe(true);
  });

  it("my_officials additionally requires a shared riding", () => {
    expect(isRevealed("my_officials", SHARED, viewer(3, MY))).toBe(true);
    expect(isRevealed("my_officials", ELSEWHERE, viewer(3, MY))).toBe(false);
    expect(isRevealed("my_officials", SHARED, viewer(2, MY))).toBe(false);
  });
});

describe("resolveVisibility cascade", () => {
  it("floors at anonymous when nothing is set", () => {
    expect(resolveVisibility(undefined, undefined)).toBe("anonymous");
    expect(resolveVisibility(null, null)).toBe("anonymous");
  });

  it("uses the account value when no thread override", () => {
    expect(resolveVisibility("my_district", undefined)).toBe("my_district");
  });

  it("applies a narrowing thread override", () => {
    // samd on his own petition thread: all_officials account, anonymous thread.
    expect(resolveVisibility("all_officials", "anonymous")).toBe("anonymous");
    expect(resolveVisibility("public", "my_district")).toBe("my_district");
  });

  it("applies a widening thread override too (thread always wins)", () => {
    // dwhitecloud fixture: id_verified thread override over an anonymous account.
    expect(resolveVisibility("anonymous", "id_verified")).toBe("id_verified");
    expect(resolveVisibility("my_district", "public")).toBe("public");
  });

  it("an equal override passes through (idempotent)", () => {
    expect(resolveVisibility("my_district", "my_district")).toBe("my_district");
  });

  it("narrowness rank is strictly increasing over the picker order", () => {
    const order: AuthorVisibility[] = [
      "public",
      "id_verified",
      "my_jurisdiction",
      "my_district",
      "all_officials",
      "my_officials",
      "anonymous",
    ];
    for (let i = 1; i < order.length; i++) {
      expect(VISIBILITY_NARROWNESS[order[i]]).toBeGreaterThan(
        VISIBILITY_NARROWNESS[order[i - 1]],
      );
    }
  });
});
