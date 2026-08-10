import { describe, expect, it } from "vitest";
import {
  anyFieldOverLimit,
  charLimitTone,
  clampTypedValue,
  resolveContentLimits,
} from "./content-limits";

describe("charLimitTone", () => {
  it("hides below 80%", () => {
    expect(charLimitTone(1599, 2000)).toBe("hidden");
    expect(charLimitTone(Math.ceil(0.8 * 2000) - 1, 2000)).toBe("hidden");
  });

  it("shows muted from 80% until near-limit", () => {
    expect(charLimitTone(Math.ceil(0.8 * 2000), 2000)).toBe("muted");
    expect(charLimitTone(Math.ceil(0.95 * 2000) - 1, 2000)).toBe("muted");
  });

  it("marks near-limit from 95% through max", () => {
    expect(charLimitTone(Math.ceil(0.95 * 2000), 2000)).toBe("near");
    expect(charLimitTone(2000, 2000)).toBe("near");
  });

  it("marks over when past max", () => {
    expect(charLimitTone(2001, 2000)).toBe("over");
  });
});

describe("clampTypedValue", () => {
  it("accepts values within the max", () => {
    expect(clampTypedValue("ab", "abc", 5)).toBe("abc");
  });

  it("blocks single-character typing past the max", () => {
    expect(clampTypedValue("abcd", "abcde", 4)).toBe("abcd");
  });

  it("allows paste that jumps past the max", () => {
    expect(clampTypedValue("ab", "abcdefghij", 4)).toBe("abcdefghij");
  });

  it("allows deletion while over the max", () => {
    expect(clampTypedValue("abcdefghij", "abcdefghi", 4)).toBe("abcdefghi");
  });
});

describe("resolveContentLimits", () => {
  it("fills missing fields from platform defaults", () => {
    const caps = resolveContentLimits({ poll: { question: 400 } });
    expect(caps.poll.question).toBe(400);
    expect(caps.poll.option).toBe(100);
    expect(caps.comment.body).toBe(2000);
  });
});

describe("anyFieldOverLimit", () => {
  it("detects an over-limit field", () => {
    expect(anyFieldOverLimit([{ length: 5, max: 10 }])).toBe(false);
    expect(anyFieldOverLimit([{ length: 11, max: 10 }])).toBe(true);
  });
});
