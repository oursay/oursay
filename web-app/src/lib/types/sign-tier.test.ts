import { describe, expect, it } from "vitest";
import {
  nextSignedFilterLevel,
  passesSignedFilter,
  clampSignedFilterLevel,
} from "@/lib/types/sign-tier";

describe("Signed filter ladder", () => {
  it("passesSignedFilter is inclusive-upward", () => {
    expect(passesSignedFilter(undefined, 0)).toBe(true);
    expect(passesSignedFilter(0, 1)).toBe(false);
    expect(passesSignedFilter(1, 1)).toBe(true);
    expect(passesSignedFilter(1, 2)).toBe(false);
    expect(passesSignedFilter(2, 2)).toBe(true);
    expect(passesSignedFilter(3, 2)).toBe(true);
  });

  it("nextSignedFilterLevel includes Biometric in development", () => {
    expect(nextSignedFilterLevel(0)).toBe(1);
    expect(nextSignedFilterLevel(1)).toBe(2);
    expect(nextSignedFilterLevel(2)).toBe(0);
  });

  it("clampSignedFilterLevel resets Biometric in production only", () => {
    if (process.env.NODE_ENV === "production") {
      expect(clampSignedFilterLevel(2)).toBe(0);
    } else {
      expect(clampSignedFilterLevel(2)).toBe(2);
    }
  });
});
